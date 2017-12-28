/*******************************************************************************
 *
 * Copyright (c) 2015 Louay Bassbouss, Fraunhofer FOKUS, All rights reserved.
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
const uuid = require("node-uuid");
const ssdp = require("peer-ssdp");
const fs = require("fs");
const ejs = require("ejs");
const os = require("os");
const util = require("util");
const events = require("events");
const http = require("http");
const URL = require("url");
const xml2js = require("xml2js");
const cors = require("cors");
const gate = require("gate");

const DEVICE_DESC_TEMPLATE = require("../xml/device-desc");
const APP_DESC_TEMPLATE = require("../xml/app-desc");
const DEVICE_DESC_RENDERER = ejs.compile(DEVICE_DESC_TEMPLATE);
const APP_DESC_RENDERER = ejs.compile(APP_DESC_TEMPLATE);
const SERVER = os.type() + "/" + os.release() + " UPnP/1.1 famium/0.0.1";
const setupServer = function() {
  const self = this;
  const pref = self.prefix;
  const peer = self.ssdpPeer;
  const serviceTypes = [
    "urn:dial-multiscreen-org:service:dial:1",
    "urn:dial-multiscreen-org:device:dial:1",
    "upnp:rootdevice",
    "ssdp:all",
    "uuid:" + self.uuid
  ];
  const appStates = ["stopped", "starting", "running"];
  const app = self.expressApp;
  app.use(pref, function(req, res, next) {
    if (
      req.is("text/plain") ||
      req.is("text/xml") ||
      req.is("text/json") ||
      req.is("application/xml") ||
      req.is("application/json") ||
      req.is("application/x-www-form-urlencoded")
    ) {
      req.text = "";
      req.length = 0;
      req.setEncoding("utf8");
      req.on("data", function(chunk) {
        req.text += chunk;
        req.length += chunk.length;
      });
      req.on("end", next);
    } else {
      next();
    }
  });

  app.use(pref + "/apps", cors(self.corsOptionsAppsDelegate));
  app.use(pref + "/ssdp", cors(self.corsOptionsSsdp));

  app.get(pref + "/apps", function(req, rsp) {
    rsp.sendStatus(204);
  });
  app.get(pref + "/apps/:appName", function(req, rsp) {
    const baseURL =
      req.protocol +
      "://" +
      (req.hostname || req.ip || self.host) +
      ":" +
      self.port +
      pref;
    const appName = req.params["appName"];
    const app = self.delegate.getApp.call(req, appName);

    if (app) {
      const state = app.state || (app.pid && "running") || "stopped";
      const xml = APP_DESC_RENDERER({
        name: appName,
        state: state,
        allowStop: app.allowStop == true,
        rel: "run",
        href: app.pid ? app.pid /*baseURL+"/apps/"+appName+"/"+app.pid*/ : null,
        additionalData: app.additionalData,
        namespaces: app.namespaces || {}
      });
      rsp.type("application/xml");
      rsp.send(xml);
    } else {
      rsp.sendStatus(404);
    }
  });
  app.post(pref + "/apps/:appName", function(req, rsp) {
    const baseURL =
      req.protocol +
      "://" +
      (req.hostname || req.ip || self.host) +
      ":" +
      self.port +
      pref;
    const appName = req.params["appName"];
    const app = self.delegate.getApp.call(this, appName);
    if (!app) {
      rsp.sendStatus(404);
    } else if (req.length && req.length > self.maxContentLength) {
      rsp.sendStatus(413); // Request Entity Too Large
    } else {
      const state = app.state || (app.pid && "running") || "stopped";
      self.delegate.launchApp.call(req, appName, req.text || null, function(
        pid,
        err
      ) {
        if (err) {
          rsp.sendStatus(503);
        } else if (pid) {
          rsp.setHeader("LOCATION", baseURL + "/apps/" + appName + "/" + pid);
          rsp.sendStatus(state == "stopped" ? 201 : 200);
        } else {
          //rsp.sendStatus(500);
          rsp.sendStatus(state == "stopped" ? 201 : 200);
        }
      });
    }
  });
  app.post(pref + "/apps/:appName/dial_data", function(req, rsp) {
    const baseURL =
      req.protocol +
      "://" +
      (req.hostname || req.ip || self.host) +
      ":" +
      self.port +
      pref;
    const appName = req.params["appName"];
    const app = self.delegate.getApp.call(req, appName);
    if (!app) {
      rsp.sendStatus(404);
    } else if (req.length && req.length > self.maxContentLength) {
      rsp.sendStatus(413); // Request Entity Too Large
    } else {
      // TODO return dial app data
      rsp.sendStatus(501);
    }
  });

  app.delete(pref + "/apps/:appName/:pid", function(req, rsp) {
    const baseURL =
      req.protocol +
      "://" +
      (req.hostname || req.ip || self.host) +
      ":" +
      self.port +
      pref;
    const appName = req.params["appName"];
    const pid = req.params["pid"];
    const app = self.delegate.getApp.call(req, appName);
    if (app) {
      if (app.allowStop) {
        if (pid) {
          self.delegate.stopApp.call(req, appName, pid, function(stopped) {
            rsp.sendStatus(stopped ? 200 : 400);
          });
        } else {
          rsp.sendStatus(400);
        }
      } else {
        rsp.sendStatus(405);
      }
    } else {
      rsp.sendStatus(404);
    }
  });
  app.get(pref + "/ssdp/device-desc.xml", function(req, rsp) {
    const baseURL =
      req.protocol +
      "://" +
      (req.hostname || req.ip || self.host) +
      ":" +
      self.port +
      pref;
    const xml = DEVICE_DESC_RENDERER({
      URLBase: baseURL,
      friendlyName: self.friendlyName,
      manufacturer: self.manufacturer,
      modelName: self.modelName,
      uuid: self.uuid
    });
    rsp.setHeader("Content-Type", "application/xml");
    rsp.setHeader("Application-URL", baseURL + "/apps");
    rsp.send(xml);
  });
  app.get(pref + "/ssdp/notfound", function(req, rsp) {
    rsp.sendStatus(404);
  });
  //const location = "http://"+self.host+":"+self.port+pref+"/ssdp/device-desc.xml";
  const location =
    "http://{{networkInterfaceAddress}}:" +
    self.port +
    pref +
    "/ssdp/device-desc.xml";
  peer
    .on("ready", function() {
      for (let i = 0; i < serviceTypes.length; i++) {
        const st = serviceTypes[i];
        peer.alive(
          merge(
            {
              NT: st,
              USN: "uuid:" + self.uuid + "::" + st,
              SERVER: SERVER,
              LOCATION: location
            },
            self.extraHeaders
          )
        );
      }
      self.emit("ready");
    })
    .on("search", function(headers, address) {
      if (serviceTypes.indexOf(headers.ST) != -1) {
        peer.reply(
          merge(
            {
              LOCATION: location,
              ST: headers.ST,
              "CONFIGID.UPNP.ORG": 7337,
              "BOOTID.UPNP.ORG": 7337,
              SERVER: SERVER,
              USN: "uuid:" + self.uuid + "::" + headers.ST
            },
            self.extraHeaders
          ),
          address
        );
      }
    })
    .on("close", function() {
      self.emit("stop");
    });
};

const getExtraHeaders = function(dict) {
  const extraHeaders = {};
  if (typeof dict == "object") {
    for (let key in dict) {
      const value = dict[key];
      if (
        typeof value == "number" ||
        typeof value == "string" ||
        typeof value == "boolean"
      ) {
        extraHeaders[key] = value;
      }
    }
  }
  return extraHeaders;
};

const merge = function(obj1, obj2) {
  for (let key in obj2) {
    const val1 = obj1[key];
    obj1[key] = val1 || obj2[key];
  }
  return obj1;
};
/**
 *
 */
const DIALServer = function(options) {
  this.expressApp = options.expressApp || null;
  this.prefix = options.prefix || "";
  this.port = options.port || null;
  this.host = options.host || null;
  this.uuid = options.uuid || uuid.v4();
  this.friendlyName = options.friendlyName || os.hostname() || "unknown";
  this.manufacturer = options.manufacturer || "unknown manufacturer";
  this.modelName = options.modelName || "unknown model";
  this.maxContentLength = Math.max(
    parseInt(options.maxContentLength) || 4096,
    4096
  );
  this.extraHeaders = getExtraHeaders(options.extraHeaders);
  this.delegate = {};
  this.delegate.getApp =
    options.delegate && typeof options.delegate.getApp == "function"
      ? options.delegate.getApp
      : null;
  this.delegate.launchApp =
    options.delegate && typeof options.delegate.launchApp == "function"
      ? options.delegate.launchApp
      : null;
  this.delegate.stopApp =
    options.delegate && typeof options.delegate.stopApp == "function"
      ? options.delegate.stopApp
      : null;

  const corsAllowOrigins = options.corsAllowOrigins || false; // no origin allowed by default
  this.corsOptionsSsdp = {
    origin: corsAllowOrigins,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposedHeaders: ["Location"]
  };
  const corsOptionsApps = {
    origin: corsAllowOrigins,
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  };
  this.corsOptionsAppsDelegate = function(req, callback) {
    const origin = req.header("origin");
    if (!origin) {
      // no cors headers
      callback(null, { origin: false });
    } else if (!/^(http|https|file):/i.test(origin)) {
      // include cors headers and allow every origin for any scheme not http[s]/file
      callback(null, { origin: true });
    } else {
      callback(null, corsOptionsApps);
    }
  };

  this.ssdpPeer = ssdp.createPeer();
  setupServer.call(this);
};
util.inherits(DIALServer, events.EventEmitter);

DIALServer.prototype.start = function() {
  this.ssdpPeer.start();
};

DIALServer.prototype.stop = function() {
  const self = this;
  const pref = self.prefix;
  const serviceTypes = [
    "urn:dial-multiscreen-org:service:dial:1",
    "urn:dial-multiscreen-org:device:dial:1",
    "upnp:rootdevice",
    "ssdp:all",
    "uuid:" + self.uuid
  ];
  //const location = "http://"+self.host+":"+self.port+pref+"/ssdp/device-desc.xml";
  const location =
    "http://{{networkInterfaceAddress}}:" +
    self.port +
    pref +
    "/ssdp/device-desc.xml";
  const peer = self.ssdpPeer;
  const g = gate.create();
  for (let i = 0; i < serviceTypes.length; i++) {
    const st = serviceTypes[i];
    peer.byebye(
      merge(
        {
          NT: st,
          USN: "uuid:" + self.uuid + "::" + st,
          SERVER: SERVER,
          LOCATION: location
        },
        self.extraHeaders
      ),
      g.latch()
    );
  }
  g.await(function() {
    self.ssdpPeer.close();
  });
};

const DIALClient = function(options) {
  const serviceTypes = [
    "urn:dial-multiscreen-org:service:dial:1",
    "urn:dial-multiscreen-org:device:dial:1"
  ];
  const self = this;
  const services = {};
  this.ssdpPeer = new ssdp.createPeer();
  this.ssdpPeer
    .on("ready", function() {
      self.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:device:dial:1" });
      self.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:service:dial:1" });
      self.emit("ready");
    })
    .on("found", function(headers, address) {
      const location = headers.LOCATION;
      if (location && !services[location]) {
        services[location] = headers;
        self.emit("found", location, headers);
      }
    })
    .on("notify", function(headers, address) {
      const location = headers.LOCATION;
      const nts = headers.NTS;
      const nt = headers.NT;
      if (serviceTypes.indexOf(nt) >= 0) {
        if (location && nts == "ssdp:alive" && !services[location]) {
          services[location] = headers;
          self.emit("found", location, headers);
        } else if (location && nts == "ssdp:byebye" && services[location]) {
          const service = services[location];
          delete services[location];
          self.emit("disappear", location, service);
        }
      }
    })
    .on("close", function() {
      self.emit("stop");
    });

  const start = function() {
    this.ssdpPeer.start();
  };

  const refresh = function() {
    services = {};
    this.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:device:dial:1" });
    this.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:service:dial:1" });
  };

  const stop = function() {
    this.ssdpPeer.close();
  };

  const getDialDevice = function(deviceDescriptionUrl, callback) {
    http
      .get(deviceDescriptionUrl, function(res) {
        const applicationUrl = res.headers["application-url"];
        if (res.statusCode == 200 && applicationUrl) {
          if (applicationUrl.lastIndexOf("/") == applicationUrl.length - 1) {
            applicationUrl = applicationUrl.substr(
              0,
              applicationUrl.length - 1
            );
          }
          const deviceDescriptionXml = "";
          res.setEncoding("utf8");
          res.on("data", function(chunk) {
            deviceDescriptionXml += chunk;
          });
          res.on("end", function() {
            xml2js.parseString(
              deviceDescriptionXml,
              {
                trim: true,
                explicitArray: false
              },
              function(err, deviceDescription) {
                if (err) {
                  callback(null, err);
                } else {
                  try {
                    const deviceInfo = deviceDescription.root.device;
                    deviceInfo.descriptionUrl = deviceDescriptionUrl;
                    deviceInfo.applicationUrl = applicationUrl;
                    const dialDevice = new DialDevice(deviceInfo);
                    callback(dialDevice);
                  } catch (err) {
                    callback(null, err);
                  }
                }
              }
            );
          });
        } else {
          const err = new Error(
            "Cannot get device description from " +
              deviceDescriptionUrl +
              " or Application-URL header is not set"
          );
          callback && callback(null, err);
        }
      })
      .on("error", function(err) {
        callback && callback(null, err);
      });
  };

  Object.defineProperty(this, "start", {
    get: function() {
      return start;
    }
  });

  Object.defineProperty(this, "refresh", {
    get: function() {
      return refresh;
    }
  });

  Object.defineProperty(this, "stop", {
    get: function() {
      return stop;
    }
  });

  Object.defineProperty(this, "getDialDevice", {
    get: function() {
      return getDialDevice;
    }
  });
};
util.inherits(DIALClient, events.EventEmitter);

const DialDevice = function(deviceInfo) {
  this.descriptionUrl = deviceInfo.descriptionUrl;
  this.applicationUrl = deviceInfo.applicationUrl;
  this.deviceType = deviceInfo.deviceType;
  this.friendlyName = deviceInfo.friendlyName;
  this.manufacturer = deviceInfo.manufacturer;
  this.modelName = deviceInfo.modelName;
  this.UDN = deviceInfo.UDN;
  this.icons = [];
  if (deviceInfo.iconList instanceof Array) {
    for (let i = 0; i < deviceInfo.iconList.length; i++) {
      const item = deviceInfo.iconList[i];
      item && item.icon && this.icons.push(item.icon);
    }
  } else if (deviceInfo.iconList && deviceInfo.iconList.icon) {
    this.icons.push(deviceInfo.iconList.icon);
  }
};

DialDevice.prototype.getAppInfoXml = function(appName, callback) {
  const appUrl =
    (this.applicationUrl && appName && this.applicationUrl + "/" + appName) ||
    null;
  if (!appUrl) {
    const err = new Error(
      "DIAL appName and DIAL Application-URL cannot be empty for getAppInfo"
    );
    callback && callback(null, err);
    return;
  }
  http
    .get(appUrl, function(res) {
      if (res.statusCode == 200) {
        const appInfoXml = "";
        res.setEncoding("utf8");
        res.on("data", function(chunk) {
          appInfoXml += chunk;
        });
        res.on("end", function() {
          callback(appInfoXml);
        });
      } else {
        const err = new Error("Cannot get app info from " + appUrl);
        err.code = res.statusCode;
        callback && callback(null, err);
      }
    })
    .on("error", function(err) {
      callback && callback(null, err);
    });
};

DialDevice.prototype.getAppInfo = function(appName, callback) {
  this.getAppInfoXml(appName, function(appInfoXml, err) {
    if (!appInfoXml || err) {
      callback(null, err);
    } else {
      xml2js.parseString(
        appInfoXml,
        {
          trim: true,
          explicitArray: false,
          mergeAttrs: true,
          explicitRoot: false,
          tagNameProcessors: [
            function(tagName) {
              tagName = tagName.substr(tagName.indexOf(":") + 1);
              return tagName;
            }
          ],
          attrNameProcessors: [
            function(attrName) {
              attrName = attrName.substr(attrName.indexOf(":") + 1);
              return attrName;
            }
          ]
        },
        function(err, appInfo) {
          if (err) {
            callback(null, err);
          } else {
            callback(appInfo);
          }
        }
      );
    }
  });
};

DialDevice.prototype.launchApp = function(
  appName,
  launchData,
  contentType,
  callback
) {
  const appUrl =
    (this.applicationUrl && appName && this.applicationUrl + "/" + appName) ||
    null;
  if (!appUrl) {
    const err = new Error(
      "DIAL appName and DIAL Application-URL cannot be empty for launchApp"
    );
    callback && callback(null, err);
    return;
  }
  appUrl = URL.parse(appUrl);
  const contentLength = (launchData && Buffer.byteLength(launchData)) || 0;
  const options = {
    host: appUrl.hostname,
    port: appUrl.port,
    path: appUrl.path,
    method: "POST",
    headers: {
      "CONTENT-TYPE": contentType || 'text/plain; charset="utf-8"',
      "CONTENT-LENGTH": contentLength
    }
  };

  const req = http
    .request(options, function(res) {
      const launchRes = "";
      res.setEncoding("utf8");
      res.on("data", function(chunk) {
        launchRes += chunk;
      });
      res.on("end", function() {
        if (res.statusCode >= 400) {
          const err = new Error("Cannot get app info from " + appUrl);
          err.code = res.statusCode;
          callback && callback(null, err);
        } else {
          callback && callback(launchRes);
        }
      });
    })
    .on("error", function(err) {
      callback && callback(null, err);
    });
  launchData && req.write(launchData);
  req.end();
};

DialDevice.prototype.stopApp = function(appName, pid, callback) {
  const stopUrl =
    (this.applicationUrl &&
      appName &&
      pid &&
      this.applicationUrl + "/" + appName + "/" + pid) ||
    null;
  if (!stopUrl) {
    const err = new Error(
      "DIAL appName, pid and DIAL Application-URL cannot be empty for stopApp"
    );
    callback && callback(null, err);
    return;
  }
  stopUrl = URL.parse(stopUrl);
  const options = {
    host: stopUrl.hostname,
    port: stopUrl.port,
    path: stopUrl.path,
    method: "DELETE"
  };

  const req = http
    .request(options, function(res) {
      callback && callback(res.statusCode);
    })
    .on("error", function(err) {
      callback && callback(null, err);
    });
  req.end();
};

module.exports.Server = DIALServer;
module.exports.Client = DIALClient;
