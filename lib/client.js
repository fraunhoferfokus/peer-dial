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
const ejs = require("ejs");
const os = require("os");
const util = require("util");
const events = require("events");
const http = require("http");
const URL = require("url");
const xml2js = require("xml2js");
const cors = require("cors");
const gate = require("gate");

const DialDevice = require("./device");

const DEVICE_DESC_TEMPLATE = require("../xml/device-desc");
const APP_DESC_TEMPLATE = require("../xml/app-desc");
const DEVICE_DESC_RENDERER = ejs.compile(DEVICE_DESC_TEMPLATE);
const APP_DESC_RENDERER = ejs.compile(APP_DESC_TEMPLATE);
const SERVER = os.type() + "/" + os.release() + " UPnP/1.1 famium/0.0.1";

const merge = function(obj1, obj2) {
  for (let key in obj2) {
    const val1 = obj1[key];
    obj1[key] = val1 || obj2[key];
  }
  return obj1;
};

class DIALClient extends events.EventEmitter {
  constructor() {
    super();

    const services = {};
    const serviceTypes = [
      "urn:dial-multiscreen-org:service:dial:1",
      "urn:dial-multiscreen-org:device:dial:1"
    ];

    this.ssdpPeer = new ssdp.createPeer();
    this.ssdpPeer
      .on("ready", () => {
        this.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:device:dial:1" });
        this.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:service:dial:1" });
        this.emit("ready");
      })
      .on("found", (headers, address) => {
        const location = headers.LOCATION;
        if (location && !services[location]) {
          services[location] = headers;
          this.emit("found", location, headers);
        }
      })
      .on("notify", (headers, address) => {
        const location = headers.LOCATION;
        const nts = headers.NTS;
        const nt = headers.NT;
        if (serviceTypes.indexOf(nt) >= 0) {
          if (location && nts == "ssdp:alive" && !services[location]) {
            services[location] = headers;
            this.emit("found", location, headers);
          } else if (location && nts == "ssdp:byebye" && services[location]) {
            const service = services[location];
            delete services[location];
            this.emit("disappear", location, service);
          }
        }
      })
      .on("close", () => {
        this.emit("stop");
      });

    this.start = this.start.bind(this);
    this.refresh = this.refresh.bind(this);
    this.stop = this.stop.bind(this);
    this.getDialDevice = this.getDialDevice.bind(this);
  }

  start() {
    this.ssdpPeer.start();
  }

  refresh() {
    services = {};
    this.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:device:dial:1" });
    this.ssdpPeer.search({ ST: "urn:dial-multiscreen-org:service:dial:1" });
  }

  stop() {
    this.ssdpPeer.close();
  }

  getDialDevice(deviceDescriptionUrl, callback) {
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
          let deviceDescriptionXml = "";
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
  }
}

module.exports = DIALClient;
