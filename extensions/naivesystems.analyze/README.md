# README

## To build this extension:

1. cd to `nsa-result-highlight`, install all deps with:

```bash
yarn install
```

2. Use `protoc-gen-ts` to compile `../../analyzer/proto/results.proto`:

   ../../out/bin/protoc --plugin="protoc-gen-ts=./node_modules/.bin/protoc-gen-ts" --js_out="import_style=commonjs,binary:./src" --ts_out="./src" --proto_path="../../analyzer/proto" ../../analyzer/proto/results.proto

3. Copy `./src/results_pb.js` to `./out`:

```bash
$ mkdir -p out && cp ./src/results_pb.js ./out
```

## To debug this extension:

Simply Press `F5` or Click `RUN -> START DEBUGGING` if the workspace is `vscode/nsa-result-highlight`

## To build this extension for deploy:

```bash
yarn package-web
yarn compile
yarn vsce package
```

Press y for ignore those warnings, then you will get `analyze-0.0.2.vsix`

## To test this extension on vscode.dev:

Refer to <https://code.visualstudio.com/api/extension-guides/web-extensions#test-your-web-extension-in-on-vscode.dev>

## Release

    rm -rf *.vsix dist out
    ../../out/bin/protoc --plugin="protoc-gen-ts=./node_modules/.bin/protoc-gen-ts" --js_out="import_style=commonjs,binary:./src" --ts_out="./src" --proto_path="../../analyzer/proto" ../../analyzer/proto/results.proto
    mkdir -p out && cp ./src/results_pb.js ./out
    yarn package-web
    yarn compile
    yes | yarn vsce package
    export EXTSRC=$PWD
    rm -rf ~/release-vscode-ext && mkdir ~/release-vscode-ext && cd ~/release-vscode-ext
    cp -r $EXTSRC/media media/
    cp -r $EXTSRC/node_modules .
    mkdir out
    cp $EXTSRC/out/browser.js out/
    cp $EXTSRC/out/common.js out/
    cp $EXTSRC/out/extension.js out/
    cp $EXTSRC/out/panel.js out/
    cp $EXTSRC/out/redmine.js out/
    cp $EXTSRC/out/results_pb.js out/
    cp $EXTSRC/out/results_tree.js out/
    cp $EXTSRC/out/sidebar.js out/
    mkdir -p dist/web
    cp $EXTSRC/dist/web/main.js dist/web
    cp $EXTSRC/dist/web/main.js.LICENSE.txt dist/web
    cp $EXTSRC/package.json .
    cp $EXTSRC/yarn.lock .
    mkdir src
    touch src/dummy.ts
    cp $EXTSRC/tsconfig.json .
    cp $EXTSRC/LICENSE .
    yarn vsce package
