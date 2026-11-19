# npm registry read app

Deploys only the read-only HTTP face of an already-built npm registry.

```sh
serve-npm-registry-read --registry /srv/npm-registry [--host 127.0.0.1] [--port 4873]
```

`--registry` is deliberately required. The app does not build, publish, activate,
or authenticate a registry; it starts `npm-registry-read-service` and reports one
JSON listening notice on standard output. `SIGINT` and `SIGTERM` close the server
before the process exits.
