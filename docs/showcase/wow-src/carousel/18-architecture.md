```mermaid
architecture-beta
  service web(server)[Site web]
  service db(database)[Base]
  service files(disk)[Fichiers]
  service net(internet)[Internet]
  net:R --> L:web
  web:R --> L:db
  web:B --> T:files
```
