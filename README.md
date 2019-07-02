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

As you probably noticed, the package uses import syntax, which means that you need a javascript bundler of some sort. [Webpack](https://webpack.js.org/guides/installation) is recommended, but [other bundlers](https://medium.com/@ajmeyghani/javascript-bundlers-a-comparison-e63f01f2a364#b306) are also available.

## Security
As you would expect, when using a CMS system, security is a very important component. It should not be possibly for ordinary users to access the CMS editor or successfully make a request to the CMS endpoints. It is therefore strongly recommended that you have some kind of login system for administrators when using this module. The authnetication of users is not handled what so ever in the module, this responsibility is completely on you, as the developer of the service or website, to implement.

On the client, a simple way of athentication would be to specify the auth option in the CMS class to be the current session id.

Like so:
```js
import CMS from "cms-module-client";
import { readCookie } from "./util";

const sessId = readCookie("SESSION_ID");
const cms = new CMS({ auth: sessId });

cms.run();
```

The value specified in the auth option will be sent as an `Authorization` header. This can then be used on the server to check the authorization status of the user sending the save request.