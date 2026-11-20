/**
 * A WASI (preview 1) host over an in-memory file system, written for `pandoc.wasm` and nothing else: no
 * network, no clock sleeps, no process. It runs the same in a browser worker and under Node, which the
 * CI smoke test uses.
 *
 * File system: one root directory, preopened as `/` on file descriptor 3, holding directories and files
 * (`Uint8Array`). Nothing outside it exists for the module, so whatever Pandoc or a Lua filter asks for
 * can only ever reach files this page put there itself.
 *
 * Layouts and constants: WASI preview 1 (`wasi_snapshot_preview1`), as documented in the WebAssembly
 * WASI repository (`legacy/preview1/docs.md`).
 */

const ERRNO = { SUCCESS: 0, BADF: 8, EXIST: 20, INVAL: 28, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54, NOTEMPTY: 55, NOTSUP: 58 };
const FILETYPE = { CHARACTER_DEVICE: 2, DIRECTORY: 3, REGULAR_FILE: 4 };
const OFLAGS = { CREAT: 1, DIRECTORY: 2, EXCL: 4, TRUNC: 8 };
const FDFLAGS_APPEND = 1;
const WHENCE = { SET: 0, CUR: 1, END: 2 };
const ALL_RIGHTS = 0x1fffffffn;
const PREOPEN_FD = 3;

/** Thrown by `proc_exit`: the module asked to stop. */
export class WasiExit extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`pandoc.wasm exited with code ${code}`);
    this.name = 'WasiExit';
    this.code = code;
  }
}

/** A regular file: its bytes and its length (the buffer grows in steps). */
class MemFile {
  constructor(data = new Uint8Array(0)) {
    this.data = data;
    this.size = data.length;
  }
  /** The file's content, exactly `size` bytes. */
  bytes() {
    return this.data.subarray(0, this.size);
  }
  /** @param {number} size */
  truncate(size) {
    this.ensure(size);
    if (size < this.size) this.data.fill(0, size, this.size);
    this.size = size;
  }
  /** @param {number} capacity */
  ensure(capacity) {
    if (capacity <= this.data.length) return;
    const grown = new Uint8Array(Math.max(capacity, this.data.length * 2, 4096));
    grown.set(this.data.subarray(0, this.size));
    this.data = grown;
  }
}

class MemDir {
  constructor() {
    /** @type {Map<string, MemFile | MemDir>} */
    this.entries = new Map();
  }
}

/**
 * The in-memory host. `imports` goes to `WebAssembly.instantiate` as `wasi_snapshot_preview1`; call
 * `bind(instance)` once the module is instantiated.
 */
export class MemoryWasi {
  /** @param {{ args?: string[] }} [options] */
  constructor({ args = [] } = {}) {
    this.args = args;
    this.root = new MemDir();
    /** @type {WebAssembly.Memory | null} */
    this.memory = null;
    /** @type {Map<number, { node: MemFile | MemDir | null, kind: 'stdio' | 'file' | 'dir', pos: number, append: boolean, cookie?: number }>} */
    this.fds = new Map();
    for (const fd of [0, 1, 2]) this.fds.set(fd, { node: null, kind: 'stdio', pos: 0, append: false });
    this.fds.set(PREOPEN_FD, { node: this.root, kind: 'dir', pos: 0, append: false });
    this.nextFd = PREOPEN_FD + 1;
    this.imports = this.buildImports();
  }

  /** @param {WebAssembly.Instance} instance */
  bind(instance) {
    this.memory = /** @type {WebAssembly.Memory} */ (instance.exports.memory);
  }

  /** Removes every file and directory under `/` (the preopen itself stays). */
  clear() {
    this.root.entries.clear();
  }

  /**
   * Writes a file at the root, replacing any existing one.
   * @param {string} name A plain file name (no `/`).
   * @param {Uint8Array | string} content
   */
  writeFile(name, content) {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.root.entries.set(checkedName(name), new MemFile(bytes.slice()));
  }

  /**
   * A file at the root, or `undefined`.
   * @param {string} name
   * @returns {Uint8Array | undefined}
   */
  readFile(name) {
    const node = this.root.entries.get(name);
    return node instanceof MemFile ? node.bytes().slice() : undefined;
  }

  // --- memory access -------------------------------------------------------------------------------

  view() {
    return new DataView(/** @type {WebAssembly.Memory} */ (this.memory).buffer);
  }
  u8() {
    return new Uint8Array(/** @type {WebAssembly.Memory} */ (this.memory).buffer);
  }
  string(ptr, len) {
    return new TextDecoder().decode(this.u8().subarray(ptr, ptr + len));
  }
  /** The (buffer pointer, length) pairs of an iovec array. */
  iovecs(ptr, count) {
    const v = this.view();
    const out = [];
    for (let i = 0; i < count; i++) out.push([v.getUint32(ptr + 8 * i, true), v.getUint32(ptr + 8 * i + 4, true)]);
    return out;
  }

  // --- paths ---------------------------------------------------------------------------------------

  /**
   * Splits `path` (relative to the directory open on `dirFd`) into the parent directory and the last
   * component. `..` never climbs above the root.
   * @returns {{ parent: MemDir, name: string } | number} or an errno
   */
  locate(dirFd, path) {
    const base = this.fds.get(dirFd);
    if (!base || !(base.node instanceof MemDir)) return ERRNO.BADF;
    const stack = path.startsWith('/') ? [this.root] : this.pathTo(base.node);
    if (!stack) return ERRNO.NOENT;
    const parts = path.split('/').filter((p) => p !== '' && p !== '.');
    const last = parts.pop();
    for (const part of parts) {
      if (part === '..') {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const next = stack[stack.length - 1].entries.get(part);
      if (!next) return ERRNO.NOENT;
      if (!(next instanceof MemDir)) return ERRNO.NOTDIR;
      stack.push(next);
    }
    if (last === undefined) return { parent: stack[stack.length - 1], name: '.' };
    if (last === '..') {
      if (stack.length > 1) stack.pop();
      return { parent: stack[stack.length - 1], name: '.' };
    }
    return { parent: stack[stack.length - 1], name: last };
  }

  /** The chain of directories from the root down to `dir`, or `null` if `dir` is not in the tree. */
  pathTo(dir) {
    if (dir === this.root) return [this.root];
    const walk = (current, chain) => {
      for (const child of current.entries.values()) {
        if (!(child instanceof MemDir)) continue;
        if (child === dir) return [...chain, child];
        const found = walk(child, [...chain, child]);
        if (found) return found;
      }
      return null;
    };
    return walk(this.root, [this.root]);
  }

  /** The node `name` names inside `parent` (`.` is the parent itself). */
  static child(parent, name) {
    return name === '.' ? parent : parent.entries.get(name);
  }

  // --- stat helpers --------------------------------------------------------------------------------

  writeFilestat(ptr, node) {
    const v = this.view();
    for (let i = 0; i < 64; i += 8) v.setBigUint64(ptr + i, 0n, true);
    const isDir = node instanceof MemDir;
    v.setUint8(ptr + 16, node === null ? FILETYPE.CHARACTER_DEVICE : isDir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR_FILE);
    v.setBigUint64(ptr + 24, 1n, true);
    v.setBigUint64(ptr + 32, BigInt(node instanceof MemFile ? node.size : 0), true);
  }

  openFd(node, append = false) {
    const fd = this.nextFd++;
    this.fds.set(fd, { node, kind: node instanceof MemDir ? 'dir' : 'file', pos: 0, append });
    return fd;
  }

  // --- the imports ---------------------------------------------------------------------------------

  buildImports() {
    const self = this;
    const enc = new TextEncoder();
    const argBytes = () => self.args.map((a) => enc.encode(`${a}\0`));

    // A JavaScript exception thrown by one of these (a bug here) is not turned into an errno: it unwinds
    // out of the module, and the conversion fails with that error instead of producing a wrong document.
    return {
      args_sizes_get(countPtr, sizePtr) {
        const list = argBytes();
        const v = self.view();
        v.setUint32(countPtr, list.length, true);
        v.setUint32(sizePtr, list.reduce((n, b) => n + b.length, 0), true);
        return ERRNO.SUCCESS;
      },
      args_get(argvPtr, bufPtr) {
        const v = self.view();
        const mem = self.u8();
        let offset = bufPtr;
        argBytes().forEach((bytes, i) => {
          v.setUint32(argvPtr + 4 * i, offset, true);
          mem.set(bytes, offset);
          offset += bytes.length;
        });
        return ERRNO.SUCCESS;
      },
      // No environment: Pandoc and its Lua filters see no variable at all.
      environ_sizes_get(countPtr, sizePtr) {
        self.view().setUint32(countPtr, 0, true);
        self.view().setUint32(sizePtr, 0, true);
        return ERRNO.SUCCESS;
      },
      environ_get() {
        return ERRNO.SUCCESS;
      },
      clock_res_get(_id, resPtr) {
        self.view().setBigUint64(resPtr, 1000n, true);
        return ERRNO.SUCCESS;
      },
      clock_time_get(id, _precision, timePtr) {
        // 0 = realtime, anything else is a monotonic clock for this module.
        const ms = id === 0 ? Date.now() : performance.now();
        self.view().setBigUint64(timePtr, BigInt(Math.round(ms * 1e6)), true);
        return ERRNO.SUCCESS;
      },
      fd_close(fd) {
        if (!self.fds.has(fd)) return ERRNO.BADF;
        if (fd > PREOPEN_FD) self.fds.delete(fd);
        return ERRNO.SUCCESS;
      },
      fd_fdstat_get(fd, ptr) {
        const entry = self.fds.get(fd);
        if (!entry) return ERRNO.BADF;
        const v = self.view();
        const type = entry.kind === 'stdio' ? FILETYPE.CHARACTER_DEVICE : entry.kind === 'dir' ? FILETYPE.DIRECTORY : FILETYPE.REGULAR_FILE;
        v.setUint8(ptr, type);
        v.setUint16(ptr + 2, entry.append ? FDFLAGS_APPEND : 0, true);
        v.setBigUint64(ptr + 8, ALL_RIGHTS, true);
        v.setBigUint64(ptr + 16, ALL_RIGHTS, true);
        return ERRNO.SUCCESS;
      },
      fd_fdstat_set_flags(fd, flags) {
        const entry = self.fds.get(fd);
        if (!entry) return ERRNO.BADF;
        entry.append = (flags & FDFLAGS_APPEND) !== 0;
        return ERRNO.SUCCESS;
      },
      fd_filestat_get(fd, ptr) {
        const entry = self.fds.get(fd);
        if (!entry) return ERRNO.BADF;
        self.writeFilestat(ptr, entry.node);
        return ERRNO.SUCCESS;
      },
      fd_filestat_set_size(fd, size) {
        const entry = self.fds.get(fd);
        if (!entry || !(entry.node instanceof MemFile)) return ERRNO.BADF;
        entry.node.truncate(Number(size));
        return ERRNO.SUCCESS;
      },
      fd_prestat_get(fd, ptr) {
        if (fd !== PREOPEN_FD) return ERRNO.BADF;
        self.view().setUint8(ptr, 0);
        self.view().setUint32(ptr + 4, 1, true);
        return ERRNO.SUCCESS;
      },
      fd_prestat_dir_name(fd, pathPtr, len) {
        if (fd !== PREOPEN_FD) return ERRNO.BADF;
        if (len >= 1) self.u8()[pathPtr] = 0x2f; // "/"
        return ERRNO.SUCCESS;
      },
      fd_read(fd, iovsPtr, iovsLen, nreadPtr) {
        const entry = self.fds.get(fd);
        if (!entry) return ERRNO.BADF;
        if (entry.kind === 'dir') return ERRNO.ISDIR;
        let total = 0;
        if (entry.node instanceof MemFile) {
          const file = entry.node;
          const mem = self.u8();
          for (const [buf, len] of self.iovecs(iovsPtr, iovsLen)) {
            const n = Math.max(0, Math.min(len, file.size - entry.pos));
            mem.set(file.data.subarray(entry.pos, entry.pos + n), buf);
            entry.pos += n;
            total += n;
            if (n < len) break;
          }
        }
        // stdin (fd 0) is always empty: the converter passes input through the file named "stdin".
        self.view().setUint32(nreadPtr, total, true);
        return ERRNO.SUCCESS;
      },
      fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
        const entry = self.fds.get(fd);
        if (!entry) return ERRNO.BADF;
        if (entry.kind === 'dir') return ERRNO.ISDIR;
        let total = 0;
        const mem = self.u8();
        for (const [buf, len] of self.iovecs(iovsPtr, iovsLen)) {
          if (entry.node instanceof MemFile) {
            const file = entry.node;
            if (entry.append) entry.pos = file.size;
            file.ensure(entry.pos + len);
            file.data.set(mem.subarray(buf, buf + len), entry.pos);
            entry.pos += len;
            file.size = Math.max(file.size, entry.pos);
          }
          // fd 1 and 2: Pandoc writes its results to the files "stdout" and "stderr"; the RTS's own
          // console output, if any, is dropped.
          total += len;
        }
        self.view().setUint32(nwrittenPtr, total, true);
        return ERRNO.SUCCESS;
      },
      fd_seek(fd, offset, whence, newOffsetPtr) {
        const entry = self.fds.get(fd);
        if (!entry) return ERRNO.BADF;
        if (!(entry.node instanceof MemFile)) return entry.kind === 'dir' ? ERRNO.ISDIR : ERRNO.NOTSUP;
        const base = whence === WHENCE.SET ? 0 : whence === WHENCE.CUR ? entry.pos : whence === WHENCE.END ? entry.node.size : -1;
        if (base < 0) return ERRNO.INVAL;
        const next = base + Number(offset);
        if (next < 0) return ERRNO.INVAL;
        entry.pos = next;
        self.view().setBigUint64(newOffsetPtr, BigInt(next), true);
        return ERRNO.SUCCESS;
      },
      fd_readdir(fd, bufPtr, bufLen, cookie, usedPtr) {
        const entry = self.fds.get(fd);
        if (!entry || !(entry.node instanceof MemDir)) return ERRNO.BADF;
        const names = ['.', '..', ...entry.node.entries.keys()];
        const v = self.view();
        const mem = self.u8();
        let used = 0;
        for (let i = Number(cookie); i < names.length; i++) {
          const name = enc.encode(names[i]);
          const node = i < 2 ? entry.node : entry.node.entries.get(names[i]);
          const header = new DataView(new ArrayBuffer(24));
          header.setBigUint64(0, BigInt(i + 1), true);
          header.setBigUint64(8, BigInt(i + 1), true);
          header.setUint32(16, name.length, true);
          header.setUint8(20, node instanceof MemDir ? FILETYPE.DIRECTORY : FILETYPE.REGULAR_FILE);
          const record = new Uint8Array(24 + name.length);
          record.set(new Uint8Array(header.buffer), 0);
          record.set(name, 24);
          // A record that does not fit is truncated: the caller sees a full buffer and asks again.
          const n = Math.min(record.length, bufLen - used);
          mem.set(record.subarray(0, n), bufPtr + used);
          used += n;
          if (used >= bufLen) break;
        }
        v.setUint32(usedPtr, used, true);
        return ERRNO.SUCCESS;
      },
      fd_renumber(from, to) {
        const entry = self.fds.get(from);
        if (!entry || !self.fds.has(to)) return ERRNO.BADF;
        self.fds.set(to, entry);
        self.fds.delete(from);
        return ERRNO.SUCCESS;
      },
      path_open(dirFd, _dirflags, pathPtr, pathLen, oflags, _rightsBase, _rightsInheriting, fdflags, fdPtr) {
        const where = self.locate(dirFd, self.string(pathPtr, pathLen));
        if (typeof where === 'number') return where;
        let node = MemoryWasi.child(where.parent, where.name);
        if (node && oflags & OFLAGS.EXCL && oflags & OFLAGS.CREAT) return ERRNO.EXIST;
        if (!node) {
          if (!(oflags & OFLAGS.CREAT) || where.name === '.') return ERRNO.NOENT;
          node = new MemFile();
          where.parent.entries.set(where.name, node);
        }
        if (oflags & OFLAGS.DIRECTORY && !(node instanceof MemDir)) return ERRNO.NOTDIR;
        if (node instanceof MemFile && oflags & OFLAGS.TRUNC) node.truncate(0);
        self.view().setUint32(fdPtr, self.openFd(node, (fdflags & FDFLAGS_APPEND) !== 0), true);
        return ERRNO.SUCCESS;
      },
      path_filestat_get(dirFd, _flags, pathPtr, pathLen, ptr) {
        const where = self.locate(dirFd, self.string(pathPtr, pathLen));
        if (typeof where === 'number') return where;
        const node = MemoryWasi.child(where.parent, where.name);
        if (!node) return ERRNO.NOENT;
        self.writeFilestat(ptr, node);
        return ERRNO.SUCCESS;
      },
      path_filestat_set_times() {
        return ERRNO.SUCCESS; // no timestamps are kept
      },
      path_create_directory(dirFd, pathPtr, pathLen) {
        const where = self.locate(dirFd, self.string(pathPtr, pathLen));
        if (typeof where === 'number') return where;
        if (MemoryWasi.child(where.parent, where.name)) return ERRNO.EXIST;
        where.parent.entries.set(where.name, new MemDir());
        return ERRNO.SUCCESS;
      },
      path_remove_directory(dirFd, pathPtr, pathLen) {
        const where = self.locate(dirFd, self.string(pathPtr, pathLen));
        if (typeof where === 'number') return where;
        const node = MemoryWasi.child(where.parent, where.name);
        if (!node) return ERRNO.NOENT;
        if (!(node instanceof MemDir) || where.name === '.') return ERRNO.NOTDIR;
        if (node.entries.size > 0) return ERRNO.NOTEMPTY;
        where.parent.entries.delete(where.name);
        return ERRNO.SUCCESS;
      },
      path_unlink_file(dirFd, pathPtr, pathLen) {
        const where = self.locate(dirFd, self.string(pathPtr, pathLen));
        if (typeof where === 'number') return where;
        const node = MemoryWasi.child(where.parent, where.name);
        if (!node) return ERRNO.NOENT;
        if (node instanceof MemDir) return ERRNO.ISDIR;
        where.parent.entries.delete(where.name);
        return ERRNO.SUCCESS;
      },
      path_rename(oldFd, oldPtr, oldLen, newFd, newPtr, newLen) {
        const from = self.locate(oldFd, self.string(oldPtr, oldLen));
        const to = self.locate(newFd, self.string(newPtr, newLen));
        if (typeof from === 'number') return from;
        if (typeof to === 'number') return to;
        const node = MemoryWasi.child(from.parent, from.name);
        if (!node || from.name === '.' || to.name === '.') return ERRNO.NOENT;
        from.parent.entries.delete(from.name);
        to.parent.entries.set(to.name, node);
        return ERRNO.SUCCESS;
      },
      // No links in this file system.
      path_readlink() {
        return ERRNO.INVAL;
      },
      path_symlink() {
        return ERRNO.NOTSUP;
      },
      poll_oneoff(inPtr, outPtr, count, neventsPtr) {
        // Every subscription is reported ready at once: files never block, and a timer would only make
        // the converter wait for nothing.
        const v = self.view();
        for (let i = 0; i < count; i++) {
          const sub = inPtr + 48 * i;
          const event = outPtr + 32 * i;
          v.setBigUint64(event, v.getBigUint64(sub, true), true);
          v.setUint16(event + 8, ERRNO.SUCCESS, true);
          v.setUint8(event + 10, v.getUint8(sub + 8));
          v.setBigUint64(event + 16, 0n, true);
          v.setUint16(event + 24, 0, true);
        }
        v.setUint32(neventsPtr, count, true);
        return ERRNO.SUCCESS;
      },
      proc_exit(code) {
        throw new WasiExit(code);
      },
      random_get(ptr, len) {
        // getRandomValues fills at most 65536 bytes per call.
        const mem = self.u8();
        for (let off = 0; off < len; off += 65536) crypto.getRandomValues(mem.subarray(ptr + off, ptr + Math.min(len, off + 65536)));
        return ERRNO.SUCCESS;
      },
    };
  }
}

/** A root file name: no separator, no `.`/`..`, so it always lands at the root. */
function checkedName(name) {
  if (!name || name.includes('/') || name === '.' || name === '..') throw new Error(`invalid file name: ${name}`);
  return name;
}

export const WASI_ERRNO = ERRNO;
