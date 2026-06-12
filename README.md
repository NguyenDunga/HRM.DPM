This project slove problem of Package in old DoNet Project.

*HRM.UI.csproj*
- JavaScript
+ Slove problem when any file is not include in Script/* it will automatedly add to project
+ Slove problem when any file js has both as min will be add to their child. For example node.js and node.min.js in same folder.File node.min.js will be add to their child of node.js
+ Slove problem of copy state when build. If a node.js and node.min.js is both exist in same folder and node.min.js is child of node.js. The main file copy when build of node.js will be change to "None copy" and node.min.js will be change to "alway copy"
- Less
+ Slove problem when any file less has 3 type style.less, style.css, style.min.css it will add nested as style.less -> style.css -> style.min.css
+ Slove problem of copy state when build. If a style.less and style.css and style.min.css exist in same file it will change style.less, style.css to "None copy" and style.min.css will change to "Alway copy"

*bundleconfig.json*
- Slove problem of bundle *\HRM.UI\bundleconfig.json when exist a missing .js in inputFiles[0] it will automatically delete the thing
- When hirachy adding file node.js and node.min.js of HRM.UI it will also check if inputFiles[0] exist or not. If not exist it will add that item into compiler list
```
{
  "outputFileName": "Scripts/_Library/Plugins/AccountSearchPlugin/AccountSearchPlugin.min.js",
  "inputFiles": [
    "Scripts/_Library/Plugins/AccountSearchPlugin/AccountSearchPlugin.js"
  ]
}
```

*compilerconfig.json*
- Slove problem of bundle *\HRM.UI\compilerconfig.json when exist a missing .css in inputFile it will automatically delete the thing
- When hirachy adding file style.less and style.css and style.min.css in HRM.UI, it will also check if outputFile exist or not. If not exist it will add that item into compiler list
```
{
  "outputFile": "Views/Main/Emp.css",
  "inputFile": "Views/Main/Emp.less",
  "sourceMap": false,
  "outputUTF8Identifier": true
}
```


Including feature library updating in HRM.PMS