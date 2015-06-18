/*******************************************************************************
 * 
 * Copyright (c) 2013 Louay Bassbouss, Fraunhofer FOKUS, All rights reserved.
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3.0 of the License, or (at your option) any later version.
 * 
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 * 
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>. 
 * 
 * AUTHORS: Louay Bassbouss (louay.bassbouss@fokus.fraunhofer.de)
 *
 ******************************************************************************/
var uuid = require('node-uuid');
var ssdp = require('peer-ssdp');
var fs = require('fs');
var ejs = require('ejs');
var os = require("os");
var util = require('util');
var events = require('events');
var http = require('http');
var xml2js = require("xml2js");

var DEVICE_DESC_TEMPLATE = fs.readFileSync(__dirname + '/../xml/device-desc.xml', 'utf8');
var APP_DESC_TEMPLATE = fs.readFileSync(__dirname + '/../xml/app-desc.xml', 'utf8');
var DEVICE_DESC_RENDERER = ejs.compile(DEVICE_DESC_TEMPLATE, { open: '{{', close: '}}' });
var APP_DESC_RENDERER = ejs.compile(APP_DESC_TEMPLATE, { open: '{{', close: '}}' });
var SERVER = os.type() + "/" + os.release() + " UPnP/1.1 famium/0.0.1";
var setupServer = function(){
	var self = this;
	var pref = self.prefix;
	var peer = self.ssdpPeer;
	var serviceTypes = ["urn:dial-multiscreen-org:service:dial:1","urn:dial-multiscreen-org:device:dial:1","upnp:rootdevice","ssdp:all","uuid:"+self.uuid];
	var appStates = ["stopped", "starting", "running"];
	var app = self.expressApp;
	app.use(function(req, res, next){
		if (req.is('text/plain')) {
			req.text = '';
			req.length = 0;
			req.setEncoding('utf8');
			req.on('data', function(chunk){ req.text += chunk; req.length += chunk.length; });
			req.on('end', next);
		} else {
			next();
		}
	});
	app.get(pref+"/apps",function(req,rsp){
		rsp.sendStatus(204);
	});
	app.get(pref+"/apps/:appName",function(req,rsp){
		var baseURL = req.protocol + "://" + (req.hostname || req.ip || self.host)+":"+self.port+pref;
		var appName = req.params["appName"];
		var app = self.delegate.getApp.call(req,appName);
		if (app) {
			var state = app.state || (app.pid && "running") || "stopped";
			var xml = APP_DESC_RENDERER({
				name: appName,
				state: state,
				allowStop: app.allowStop == true,
				rel: "run",
				href:  app.pid? baseURL+"/apps/"+appName+"/"+app.pid: null,
				additionalData: app.additionalData,
				namespaces: app.namespaces || {}
			});
			rsp.type('application/xml');
			rsp.send(xml);
		}
		else {
			rsp.sendStatus(404);
		}
	});
	app.post(pref+"/apps/:appName",function(req,rsp){
		var baseURL = req.protocol + "://" + (req.hostname || req.ip || self.host)+":"+self.port+pref;
		var appName = req.params["appName"];
		var app = self.delegate.getApp.call(this,appName);
		if (!app) {
			rsp.sendStatus(404);
		}
		else if(req.length && req.length > self.maxContentLength){
			rsp.sendStatus(413); // Request Entity Too Large
		}
		else {
			var state = app.state || (app.pid && "running") || "stopped";
			self.delegate.launchApp.call(req,appName,req.text || null,function(pid){
				if (pid) {
					rsp.setHeader('LOCATION', baseURL+"/apps/"+appName+"/"+pid);
					rsp.sendStatus(state == "stopped"? 201: 200);
				}
				else {
					rsp.sendStatus(500);
				}
			});
		}
	});
	app.post(pref+"/apps/:appName/dial_data",function(req,rsp){
		var baseURL = req.protocol + "://" + (req.hostname || req.ip || self.host)+":"+self.port+pref;
		var appName = req.params["appName"];
		var app = self.delegate.getApp.call(req,appName);
		if (!app) {
			rsp.sendStatus(404);
		}
		else if(req.length && req.length > self.maxContentLength){
			rsp.sendStatus(413); // Request Entity Too Large
		}
		else {
			// TODO return dial app data
			rsp.sendStatus(501);
		}
	});

	app.delete(pref+"/apps/:appName/:pid",function(req,rsp){
		var baseURL = req.protocol + "://" + (req.hostname || req.ip || self.host)+":"+self.port+pref;
		var appName = req.params["appName"];
		var pid = req.params["pid"];
		var app = self.delegate.getApp.call(req,appName);
		if (app) {
			if (app.allowStop) {
				if (pid) {
					self.delegate.stopApp.call(req,appName, pid, function(stopped){
						rsp.sendStatus(stopped? 200: 404);
					});
				}
				else{
					rsp.sendStatus(400);
				}
			}
			else {
				rsp.sendStatus(501);
			}
		} else {
			rsp.sendStatus(404);
		}
	});
	app.get(pref+"/ssdp/device-desc.xml",function(req,rsp){
		var baseURL = req.protocol + "://" + (req.hostname || req.ip || self.host)+":"+self.port+pref;
		var xml = DEVICE_DESC_RENDERER({
			URLBase: baseURL,
			friendlyName: self.friendlyName,
			manufacturer: self.manufacturer,
			modelName: self.modelName,
			uuid: self.uuid
		});
		rsp.setHeader("Access-Control-Allow-Method", "GET, POST, DELETE, OPTIONS");
		rsp.setHeader("Access-Control-Expose-Headers", "Location");
		rsp.setHeader('Content-Type','application/xml');
		rsp.setHeader('Application-URL', baseURL+"/apps");
		rsp.send(xml);
	});
	app.get(pref+"/ssdp/notfound",function(req,rsp){
		rsp.sendStatus(404);
	});
	//var location = "http://"+self.host+":"+self.port+pref+"/ssdp/device-desc.xml";
    var location = "http://{{networkInterfaceAddress}}:"+self.port+pref+"/ssdp/device-desc.xml";
	peer.on("ready",function(){
		for (var i = 0; i < serviceTypes.length; i++) {
			var st = serviceTypes[i];
			peer.alive(merge({
				NT: st,
				USN: "uuid:" + self.uuid + "::"+st,
				SERVER: SERVER,
				LOCATION: location
			},self.extraHeaders));
		};
		self.emit("ready");
	}).on("search",function(headers, address){
		if(serviceTypes.indexOf(headers.ST) != -1) {
			peer.reply(merge({
				LOCATION: location,
				ST: headers.ST,
				"CONFIGID.UPNP.ORG": 7337,
				"BOOTID.UPNP.ORG": 7337,
				USN: "uuid:"+self.uuid
			},self.extraHeaders), address);
		}
	}).on("close",function(){
		console.log("Server Stopped");
		self.emit("stop");
	});;
};

var getExtraHeaders =  function(dict){
	var extraHeaders = {};
	if (typeof dict == "object") {
		for(var key in dict){
			var value = dict[key];
			if (typeof value == "number" || typeof value == "string" || typeof value == "boolean") {
				extraHeaders[key] = value;
			};
		}
	};
	return extraHeaders;
}

var merge = function(obj1,obj2){
	for(var key in obj2){
		var val1 = obj1[key];
		obj1[key] = val1 || obj2[key];
	}
	return obj1;
}
/**
 * 
 */
var DIALServer = function (options) {
	this.expressApp = options.expressApp || null;
	this.prefix = options.prefix || "";
	this.port = options.port || null;
	this.host = options.host || null;
	this.uuid = options.uuid || uuid.v4();
	this.friendlyName = options.friendlyName || os.hostname() || "unknown";
	this.manufacturer = options.manufacturer || "unknown manufacturer";
	this.modelName = options.modelName || "unknown model";
	this.maxContentLength = Math.max(parseInt(options.maxContentLength) || 4096, 4096);
	this.extraHeaders = getExtraHeaders(options.extraHeaders);
	this.delegate = {};
	this.delegate.getApp = (options.delegate && typeof options.delegate.getApp == "function")? options.delegate.getApp: null;
	this.delegate.launchApp = (options.delegate && typeof options.delegate.launchApp == "function")? options.delegate.launchApp: null;
	this.delegate.stopApp = (options.delegate && typeof options.delegate.stopApp == "function")? options.delegate.stopApp: null;
	this.ssdpPeer = ssdp.createPeer();
	setupServer.call(this);
}
util.inherits(DIALServer, events.EventEmitter);

DIALServer.prototype.start = function(){
	this.ssdpPeer.start();
};

DIALServer.prototype.stop = function(){
	var self = this;
	var pref = self.prefix;
	var serviceTypes = ["urn:dial-multiscreen-org:service:dial:1","urn:dial-multiscreen-org:device:dial:1","upnp:rootdevice","ssdp:all","uuid:"+self.uuid];
	//var location = "http://"+self.host+":"+self.port+pref+"/ssdp/device-desc.xml";
    var location = "http://{{networkInterfaceAddress}}:"+self.port+pref+"/ssdp/device-desc.xml";
    var peer = self.ssdpPeer;
	for (var i = 0; i < serviceTypes.length; i++) {
		var st = serviceTypes[i];
		peer.byebye(merge({
			NT: st,
			USN: "uuid:" + self.uuid + "::"+st,
			SERVER: SERVER,
			LOCATION: location
		},self.extraHeaders));
	};
	self.ssdpPeer.close();
};

var DIALClient = function (options) {
	var serviceTypes = ["urn:dial-multiscreen-org:service:dial:1","urn:dial-multiscreen-org:device:dial:1"];
	var self = this;
	var services = {};
	this.ssdpPeer = new ssdp.createPeer();
	this.ssdpPeer.on("ready",function(){
		self.ssdpPeer.search({ST: "urn:dial-multiscreen-org:device:dial:1"});
		self.ssdpPeer.search({ST: "urn:dial-multiscreen-org:service:dial:1"});
		self.emit("ready");
	}).on("found",function(headers, address){
		var location = headers.LOCATION;
		if (location && !services[location]) {
			services[location] = headers;
			self.emit("found",location,headers);
		};
	}).on("notify",function(headers, address){
		var location = headers.LOCATION;
		var nts =headers.NTS;
		var nt = headers.NT;
		if(serviceTypes.indexOf(nt)>=0){
			if (location && nts == "ssdp:alive" && !services[location]) {
				services[location] = headers;
				self.emit("found",location,headers);
			}
			else if(location && nts == "ssdp:byebye" && services[location]){
				delete services[location];
				self.emit("disappear",location,headers);
			}
		}
	}).on("close",function(){
		self.emit("stop");
	});


    var start = function(){
        this.ssdpPeer.start();
    };

    var refresh = function(){
        services = {};
        this.ssdpPeer.search({ST: "urn:dial-multiscreen-org:device:dial:1"});
        this.ssdpPeer.search({ST: "urn:dial-multiscreen-org:service:dial:1"});
    };

    var stop = function(){
        this.ssdpPeer.close();
    };

    var getDialDevice = function (deviceDescriptionUrl, callback) {
        http.get(deviceDescriptionUrl, function(res) {
            var applicationUrl = res.headers["application-url"];
            console.log("Got response: " + res.statusCode+" and DIAL Application-URL=",applicationUrl);
            if(res.statusCode == 200 && applicationUrl){
                var deviceDescriptionXml = "";
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    deviceDescriptionXml += chunk;
                });
                res.on('end', function () {
                    xml2js.parseString(deviceDescriptionXml, {
                        trim: true,
                        explicitArray: false
                    },function (err, deviceDescription) {
                        if(err){
                            callback(null,err);
                        }
                        else {
                            try{
                                var device = deviceDescription.root.device;

                                callback(deviceDescription);
                            }
                            catch (err){
                                callback(null,err);
                            }
                        }
                    });
                });
            }
            else {
                var err = new Error("Cannot get device description from "+deviceDescriptionUrl+" or Application-URL header is not set");
                callback && callback(null,err);
            }
        }).on('error', function(err) {
            callback && callback(null,err);
        });
    };

    Object.defineProperty(this,"start", {
        get: function(){
            return start;
        }
    });

    Object.defineProperty(this,"refresh", {
        get: function(){
            return refresh;
        }
    });

    Object.defineProperty(this,"stop", {
        get: function(){
            return stop;
        }
    });

    Object.defineProperty(this,"getDialDevice", {
        get: function(){
            return getDialDevice;
        }
    });
};
util.inherits(DIALClient, events.EventEmitter);

var DialDevice = function () {

};

module.exports.Server = DIALServer;
module.exports.Client = DIALClient;