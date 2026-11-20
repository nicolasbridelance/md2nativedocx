// The in-memory WASI host, called the way a module would call it: pointers into a WebAssembly memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryWasi, WASI_ERRNO, WasiExit } from '../src/wasi.mjs';

const PREOPEN = 3;

/** A host bound to a fresh memory, with helpers to place strings and read results. */
function setup() {
  const wasi = new MemoryWasi({ args: ['pandoc.wasm', '+RTS'] });
  const memory = new WebAssembly.Memory({ initial: 1 });
  wasi.bind(/** @type {any} */ ({ exports: { memory } })); // a stand-in instance: only `memory` is read
  const view = () => new DataView(memory.buffer);
  const bytes = () => new Uint8Array(memory.buffer);
  let top = 1024;
  const alloc = (n) => {
    const at = top;
    top += Math.ceil(n / 8) * 8;
    return at;
  };
  const str = (s) => {
    const b = new TextEncoder().encode(s);
    const at = alloc(b.length);
    bytes().set(b, at);
    return [at, b.length];
  };
  const imports = wasi.imports;
  const open = (path, oflags = 0) => {
    const out = alloc(4);
    const errno = imports.path_open(PREOPEN, 0, ...str(path), oflags, 0n, 0n, 0, out);
    return [errno, view().getUint32(out, true)];
  };
  const write = (fd, text) => {
    const [buf, len] = str(text);
    const iov = alloc(8);
    view().setUint32(iov, buf, true);
    view().setUint32(iov + 4, len, true);
    const n = alloc(4);
    assert.equal(imports.fd_write(fd, iov, 1, n), WASI_ERRNO.SUCCESS);
    return view().getUint32(n, true);
  };
  const read = (fd, max = 64) => {
    const buf = alloc(max);
    const iov = alloc(8);
    view().setUint32(iov, buf, true);
    view().setUint32(iov + 4, max, true);
    const n = alloc(4);
    assert.equal(imports.fd_read(fd, iov, 1, n), WASI_ERRNO.SUCCESS);
    return new TextDecoder().decode(bytes().slice(buf, buf + view().getUint32(n, true)));
  };
  return { wasi, imports, view, alloc, str, open, write, read };
}

test('the preopen is "/" on fd 3 and nothing else is preopened', () => {
  const { imports, view, alloc } = setup();
  const p = alloc(8);
  assert.equal(imports.fd_prestat_get(3, p), WASI_ERRNO.SUCCESS);
  assert.equal(view().getUint32(p + 4, true), 1);
  assert.equal(imports.fd_prestat_get(4, p), WASI_ERRNO.BADF);
});

test('files created by the module can be written, sought, read back and read by the host', () => {
  const { wasi, imports, open, write, read, view, alloc } = setup();
  const [errno, fd] = open('out.txt', 1 /* CREAT */);
  assert.equal(errno, WASI_ERRNO.SUCCESS);
  assert.equal(write(fd, 'hello world'), 11);
  const pos = alloc(8);
  assert.equal(imports.fd_seek(fd, 6n, 0 /* SET */, pos), WASI_ERRNO.SUCCESS);
  assert.equal(view().getBigUint64(pos, true), 6n);
  assert.equal(read(fd), 'world');
  assert.equal(new TextDecoder().decode(wasi.readFile('out.txt')), 'hello world');
  assert.equal(imports.fd_close(fd), WASI_ERRNO.SUCCESS);
  assert.equal(imports.fd_close(fd), WASI_ERRNO.BADF);
});

test('files from the host are readable, a missing file is NOENT, TRUNC empties a file', () => {
  const { wasi, open, read } = setup();
  wasi.writeFile('stdin', '# Title');
  const [, fd] = open('stdin');
  assert.equal(read(fd), '# Title');
  assert.equal(open('nope.txt')[0], WASI_ERRNO.NOENT);
  const [, again] = open('stdin', 8 /* TRUNC */);
  assert.equal(read(again), '');
});

test('paths never climb above the root and directories work', () => {
  const { wasi, imports, str, open, write } = setup();
  assert.equal(imports.path_create_directory(PREOPEN, ...str('tmp')), WASI_ERRNO.SUCCESS);
  assert.equal(imports.path_create_directory(PREOPEN, ...str('tmp')), WASI_ERRNO.EXIST);
  const [, fd] = open('tmp/../../../escape.txt', 1);
  write(fd, 'x');
  assert.ok(wasi.readFile('escape.txt'), 'the file lands at the root, not above it');
  const [, inner] = open('/tmp/a.txt', 1);
  write(inner, 'a');
  assert.equal(imports.path_remove_directory(PREOPEN, ...str('tmp')), WASI_ERRNO.NOTEMPTY);
  assert.equal(imports.path_rename(PREOPEN, ...str('tmp/a.txt'), PREOPEN, ...str('b.txt')), WASI_ERRNO.SUCCESS);
  assert.equal(new TextDecoder().decode(wasi.readFile('b.txt')), 'a');
  assert.equal(imports.path_remove_directory(PREOPEN, ...str('tmp')), WASI_ERRNO.SUCCESS);
  assert.equal(imports.path_unlink_file(PREOPEN, ...str('b.txt')), WASI_ERRNO.SUCCESS);
  assert.equal(wasi.readFile('b.txt'), undefined);
});

test('readdir lists ".", ".." and the entries', () => {
  const { wasi, imports, open, view, alloc } = setup();
  wasi.writeFile('one', '1');
  wasi.writeFile('two', '2');
  const [, dirFd] = open('.', 2 /* DIRECTORY */);
  const buf = alloc(512);
  const used = alloc(4);
  assert.equal(imports.fd_readdir(dirFd, buf, 512, 0n, used), WASI_ERRNO.SUCCESS);
  const names = [];
  let at = buf;
  const end = buf + view().getUint32(used, true);
  while (at < end) {
    const len = view().getUint32(at + 16, true);
    names.push(new TextDecoder().decode(new Uint8Array(view().buffer, at + 24, len)));
    at += 24 + len;
  }
  assert.deepEqual(names, ['.', '..', 'one', 'two']);
});

test('no environment, the given arguments, and proc_exit stops the module', () => {
  const { imports, view, alloc } = setup();
  const count = alloc(4);
  const size = alloc(4);
  imports.environ_sizes_get(count, size);
  assert.equal(view().getUint32(count, true), 0);
  imports.args_sizes_get(count, size);
  assert.equal(view().getUint32(count, true), 2);
  assert.equal(view().getUint32(size, true), 'pandoc.wasm\0+RTS\0'.length);
  assert.throws(() => imports.proc_exit(3), (err) => err instanceof WasiExit && err.code === 3);
});

test('host file names cannot reach outside the root', () => {
  const { wasi } = setup();
  for (const bad of ['', '.', '..', 'a/b', '../x']) assert.throws(() => wasi.writeFile(bad, 'x'), /invalid file name/);
});
