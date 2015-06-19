peer-dial 
=========

peer-dial is a simple Node.js module implementing the Discovery and Launch Protocol DIAL as described in the
[Protocol Specification Document](http://www.dial-multiscreen.org/dial-protocol-specification)

Dependencies
============

  * [Node.js](https://nodejs.org/). tested with version 0.12.4
  * `Node.js` includes also `npm` to install directly using npm CLI as described in setup.

Setup
=====

  * use `npm install peer-dial` to install the module.

Run Examples
============

  * run DIAL Server Example with `node node_modules/peer-dial/test/dial-server.js` 
  * run DIAL Client Example with `node node_modules/peer-dial/test/dial-client.js`

Usage
=====

The `peer-dial` modules contains implementation for DIAL Client and Server.

For DIAL Server usage please have a look to the following example ([test/dial-server.js](test/dial-server.js)).  In this example the DIAL Server supports the "YouTube" App through DIAL. This DIAL Server should be discoverable from YouTube App on iOS or Android. Just click on the cast button in the YouTube mobile App and select the name of your device. You can extend this example to support your custum DIAL Apps. Additional configuration parameters like `additionalData`, `namespaces`, `extraHeaders`, etc.  which are not used in the YouTube DIAL App are commented in this example. `peer-dial` uses these parameters to generate the UPnP device description and DIAL app description xml as defined in the DIAL Spec.

```javascript
var dial = require("../index.js");
var http = require('http');
var express = require('express');
var opn = require("opn");
var app = express();
var server = http.createServer(app);
var PORT = 3000;
var MANUFACTURER = "Fraunhofer FOKUS";
var MODEL_NAME = "DIAL Demo Server";
var apps = {
	"YouTube": {
		name: "YouTube",
		state: "stopped",
		allowStop: true,
		pid: null,
    /*
    additionalData: {
        "ex:key1":"value1",
        "ex:key2":"value2"
    },
    namespaces: {
       "ex": "urn:example:org:2014"
    }*/
    launch: function (launchData) {
        opn("http://www.youtube.com/tv?"+launchData);
    }
	}
};
var dialServer = new dial.Server({
	expressApp: app,
	port: PORT,
    prefix: "/dial",
	manufacturer: MANUFACTURER,
	modelName: MODEL_NAME,
	/*extraHeaders: {
		"X-MY_HEADER": "My Value"
	},*/
	delegate: {
		getApp: function(appName){
			var app = apps[appName];
			return app;
		},
		launchApp: function(appName,lauchData,callback){
			console.log("Got request to launch", appName," with launch data: ", lauchData);
			var app = apps[appName];
			var pid = null;
			if (app) {
				app.pid = "run";
				app.state = "starting";
                app.launch(lauchData);
                app.state = "running";
			}
			callback(app.pid);
		},
		stopApp: function(appName,pid,callback){
            console.log("Got request to stop", appName," with pid: ", pid);
			var app = apps[appName];
			if (app && app.pid == pid) {
				app.pid = null;
				app.state = "stopped";
				callback(true);
			}
			else {
				callback(false);
			}
		}
	}
});
server.listen(PORT,function(){
	dialServer.start();
	// dialServer.stop();
	console.log("DIAL Server is running on PORT "+PORT);
});
```

For DIAL Client usage please have a look to the following example ([test/dial-client.js](test/dial-client.js)). This example contains calls for all interfaces of DIAL Client and DIAL Device, some of them are commented like `dialDevice.stopApp(...)` and `dialClient.stop();`

```javascript
var dial = require("peer-dial.js");
var dialClient = new dial.Client();
dialClient.on("ready",function(){
    console.log("DIAL client is ready");
}).on("found",function(deviceDescriptionUrl, ssdpHeaders){
    console.log("DIAL device found");
    console.log("Request DIAL device description from",deviceDescriptionUrl);
    dialClient.getDialDevice(deviceDescriptionUrl, function (dialDevice, err) {
        if(dialDevice){
            console.log("Got DIAL device description: ",dialDevice);
            console.log("Request YouTube DIAL App from",dialDevice.applicationUrl);
            dialDevice.getAppInfo("YouTube", function (appInfo, err) {
                if(appInfo){
                    console.log("Got YouTube App Info from", dialDevice.applicationUrl+"/YouTube");
                    dialDevice.launchApp("YouTube","v=YE7VzlLtp-4", "text/plain", function (launchRes, err) {
                        if(typeof launchRes != "undefined"){
                            console.log("YouTube Launched Successfully",launchRes);
                            /*dialDevice.stopApp("YouTube","run", function (statusCode,err) {
                                if(err){
                                    console.error("Error on stop YouTube App:", err);
                                }
                                else {
                                    console.log("DIAL stop YouTube App status: ",statusCode);
                                }
                            });*/
                        }
                        else if(err){
                            console.log("Error on Launch YouTube App",launchRes);
                        }
                    });
                }
                else if(err){
                    console.error("Error on get YouTube App Info or YouTube App is not available on",deviceDescriptionUrl);
                }
            });
        }
        else if(err){
            console.error("Error on get DIAL device description from ",deviceDescriptionUrl, err);
        }
    });
}).on("disappear", function(deviceDescriptionUrl, dialDevice){
    console.log("DIAL device ", deviceDescriptionUrl," disappeared");
}).on("stop", function(){
    console.log("DIAL client is stopped");
}).start();
// dialClient.stop();
```

License
=======

Free for non commercial use released under the GNU Lesser General Public License v3.0
, See LICENSE file.

Contact us for commecial use famecontact@fokus.fraunhofer.de

Copyright (c) 2015 Fraunhofer FOKUS
