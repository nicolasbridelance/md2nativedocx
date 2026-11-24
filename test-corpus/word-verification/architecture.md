# architecture

Services as Mermaid draws them (blue icon, white drawing, title under it), junctions invisible, groups as dashed frames with icon and title, nested; placement on the grid the ports describe, `align row|column` applied. Mermaid 12.3.0 official architecture examples #0 to #5, then cases they do not cover.

## architecture#0 (groups, ports on every side)

```mermaid
architecture-beta
    group api(cloud)[API]

    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service disk2(disk)[Storage] in api
    service server(server)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
    disk2:T -- B:db
```

## architecture#1 (align column (three databases into one server))

```mermaid
architecture-beta
    group api(cloud)[API]
    service db1(database)[DB1] in api
    service db2(database)[DB2] in api
    service db3(database)[DB3] in api
    service mcp(server)[MCP] in api
    db1:R --> L:mcp
    db2:R --> L:mcp
    db3:R --> L:mcp
    align column db1 db2 db3
```

## architecture#2 (align row (three sources into one processor))

```mermaid
architecture-beta
    service src1(server)[Source 1]
    service src2(server)[Source 2]
    service src3(server)[Source 3]
    service proc(server)[Processor]
    src1:B --> T:proc
    src2:B --> T:proc
    src3:B --> T:proc
    align row src1 src2 src3
```

## architecture#3 (three groups, align rows and columns)

```mermaid
architecture-beta
    group sources(cloud)[Sources]
        service src_a(server)[Source A] in sources
        service src_b(server)[Source B] in sources
        service src_c(server)[Source C] in sources

    group storage(database)[Storage]
        service db_one(database)[DB One] in storage
        service db_two(database)[DB Two] in storage
        service db_three(database)[DB Three] in storage

    group output(disk)[Output]
        service brief(disk)[Brief] in output
        service analyst(server)[Analyst] in output
        service delivery(cloud)[Delivery] in output

    src_a:B --> T:db_one
    src_b:B --> T:db_two
    src_c:B --> T:db_three
    db_two:B --> T:brief
    brief:R --> L:analyst
    analyst:R --> L:delivery

    align row src_a src_b src_c
    align row db_one db_two db_three
    align row brief analyst delivery

    align column src_a db_one
    align column src_b db_two brief
    align column src_c db_three
```

## architecture#4 (junctions)

```mermaid
architecture-beta
    service left_disk(disk)[Disk]
    service top_disk(disk)[Disk]
    service bottom_disk(disk)[Disk]
    service top_gateway(internet)[Gateway]
    service bottom_gateway(internet)[Gateway]
    junction junctionCenter
    junction junctionRight

    left_disk:R -- L:junctionCenter
    top_disk:B -- T:junctionCenter
    bottom_disk:T -- B:junctionCenter
    junctionCenter:R -- L:junctionRight
    top_gateway:B -- T:junctionRight
    bottom_gateway:T -- B:junctionRight
```

## architecture#5 (pack icons (logos:), drawn as ? without the pack)

```mermaid
architecture-beta
    group api(logos:aws-lambda)[API]

    service db(logos:aws-aurora)[Database] in api
    service disk1(logos:aws-glacier)[Storage] in api
    service disk2(logos:aws-s3)[Storage] in api
    service server(logos:aws-ec2)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
    disk2:T -- B:db
```

## turning edges and an edge label

```mermaid
architecture-beta
    service a(server)[A]
    service b(database)[B]
    service c(disk)[C]
    a:R --> T:b
    a:B -[uses]- L:c
```

## edges to group frames ({group})

```mermaid
architecture-beta
    group g1(cloud)[G1]
    group g2(cloud)[G2]
    service a(server)[A] in g1
    service b(server)[B] in g2
    service c(internet)[C]
    a{group}:R --> L:b{group}
    c:B -- T:a
```

## nested groups, text icon, no icon

```mermaid
architecture-beta
    group outer(cloud)[Outer]
    group inner(server)[Inner] in outer
    service a(server)[A] in inner
    service b(disk)[B] in outer
    service t"Hello"[Text icon]
    service n[No icon]
    a:R -- L:b
    b:R -- L:t
    t:B -- T:n
```

