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
var dial = require("../index.js");

var dialClient = new dial.Client();

dialClient
  .on("ready", function() {
    console.log("DIAL client is ready");
  })
  .on("found", function(deviceDescriptionUrl, ssdpHeaders) {
    console.log("DIAL device found");
    console.log("Request DIAL device description from", deviceDescriptionUrl);
    dialClient.getDialDevice(deviceDescriptionUrl, function(dialDevice, err) {
      if (dialDevice) {
        console.log("Got DIAL device description: ", dialDevice);
        console.log("Request YouTube DIAL App from", dialDevice.applicationUrl);
        dialDevice.getAppInfo("YouTube", function(appInfo, err) {
          if (appInfo) {
            console.log(
              "Got YouTube App Info from",
              dialDevice.applicationUrl + "/YouTube"
            );
            dialDevice.launchApp(
              "YouTube",
              "v=YE7VzlLtp-4",
              "text/plain",
              function(launchRes, err) {
                if (typeof launchRes != "undefined") {
                  console.log("YouTube Launched Successfully", launchRes);
                  /*dialDevice.stopApp("YouTube","run", function (statusCode,err) {
                                if(err){
                                    console.error("Error on stop YouTube App:", err);
                                }
                                else {
                                    console.log("DIAL stop YouTube App status: ",statusCode);
                                }
                            });*/
                } else if (err) {
                  console.log("Error on Launch YouTube App", launchRes);
                }
              }
            );
          } else if (err) {
            console.error(
              "Error on get YouTube App Info or YouTube App is not available on",
              deviceDescriptionUrl
            );
          }
        });
      } else if (err) {
        console.error(
          "Error on get DIAL device description from ",
          deviceDescriptionUrl,
          err
        );
      }
    });
  })
  .on("disappear", function(deviceDescriptionUrl, dialDevice) {
    console.log("DIAL device ", deviceDescriptionUrl, " disappeared");
  })
  .on("stop", function() {
    console.log("DIAL client is stopped");
  })
  .start();
// dialClient.stop();
