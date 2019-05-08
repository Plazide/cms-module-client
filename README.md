# CMS Module Client
An editor for html pages. This is the client side part of the JS CMS module tool. It lets you edit a webpage in a WYSIWYG way. Together with the server side module, it creates nicely integrated content management system for Node JS.

## Installation
To install this package, simply run:
```sh
npm install cms-module-client
```

## Usage
Once installed, you need import it into your project and create an instance of the CMS class. Then, you simply have to call the `cms.run()` method. This will assign editable tags and render a toolbar containing editing options.

```js
import CMS from "cms-module-client";

const cms = new CMS();

cms.run();
```

As you probably noticed, the package uses import syntax, which means that you need a module bundler of some sort. [Webpack](https://webpack.js.org/guides/installation) is recommended, but [other bundlers](https://medium.com/@ajmeyghani/javascript-bundlers-a-comparison-e63f01f2a364#b306) are also available.