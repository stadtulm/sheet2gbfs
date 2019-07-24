GBFS_ENDPOINT = process.env.GBFS_ENDPOINT || "http://gbfs.example.invalid";
LANGUAGE = process.env.LANGUAGE || "de";

GOOGLE_SHEETS_KEY =
  process.env.GOOGLE_SHEETS_KEY ||
  "1OFBnUAaoh3shRO1ZArFxYpad-Xml7dyXgFfrchq0-Uo";
GOOGLE_SHEETS_URL = `https://spreadsheets.google.com/feeds/worksheets/${GOOGLE_SHEETS_KEY}/public/full?alt=json`;

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

let station_status = {
  stations: []
};

function fetchSheets() {
  let sheets = {};
  return fetch(GOOGLE_SHEETS_URL)
    .then(res => res.json())
    .then(json => {
      json.feed.entry.forEach(sheet => {
        let title = sheet["title"]["$t"].toLowerCase();
        let link = sheet["link"].find(
          obj =>
            obj["rel"] == "http://schemas.google.com/spreadsheets/2006#listfeed"
        );
        if (link) {
          let url = link["href"] + "?alt=json";
          sheets[title] = url;
        }
      });
      return sheets;
    });
}

function buildIndex(sheets) {
  let gbfs_json = {
    last_updated: Math.floor(new Date() / 1000),
    ttl: 0,
    data: {}
  };
  gbfs_json["data"][LANGUAGE] = { feeds: [] };
  if (sheets["system"]) {
    gbfs_json["data"][LANGUAGE]["feeds"].push({
      name: "system_information",
      url: GBFS_ENDPOINT + "/system_information.json"
    });
  }
  if (sheets["stations"]) {
    gbfs_json["data"][LANGUAGE]["feeds"].push({
      name: "station_information",
      url: GBFS_ENDPOINT + "/station_information.json"
    });
  }
  if (sheets["bikes"]) {
    gbfs_json["data"][LANGUAGE]["feeds"].push({
      name: "station_status",
      url: GBFS_ENDPOINT + "/station_status.json"
    });
  }
  return gbfs_json;
}

function loadSystemInfo(url) {
  return fetch(url)
    .then(res => res.json())
    .then(json => {
      let data = json.feed.entry[0];
      return {
        last_updated: Math.floor(new Date() / 1000),
        ttl: 0,
        data: {
          system_id: data["gsx$id"]["$t"],
          language: LANGUAGE,
          name: data["gsx$name"]["$t"],
          url: data["gsx$url"]["$t"],
          timezone: data["gsx$timezone"]["$t"],
          license_url: data["gsx$licenseurl"]["$t"]
        }
      };
    });
}

function loadStationInfo(url) {
  let station_information = {
    stations: []
  };
  return fetch(url)
    .then(res => res.json())
    .then(json => {
      json.feed.entry.forEach(station => {
        let gbfsStation = {
          station_id: station["gsx$stationid"]["$t"],
          name: station["gsx$name"]["$t"],
          lat: parseFloat(station["gsx$lat"]["$t"]),
          lon: parseFloat(station["gsx$lon"]["$t"])
        };
        station_information.stations.push(gbfsStation);

        let active = station["gsx$active"]["$t"] == "YES" ? true : false;
        let docks =
          station["gsx$maxbikes"]["$t"] == ""
            ? 10
            : parseInt(station["gsx$maxbikes"]["$t"], 10);
        let gbfsStationStatus = {
          station_id: station["gsx$stationid"]["$t"],
          num_bikes_available: 0,
          num_docks_available: docks,
          is_installed: active,
          is_renting: active,
          is_returning: active
        };
        station_status.stations.push(gbfsStationStatus);
      });
      return station_information;
    });
}

function loadBikeInfo(url) {
  return fetch(url)
    .then(res => res.json())
    .then(json => {
      json.feed.entry.forEach(bike => {
        if (bike["gsx$status"]["$t"] == "AVAILABLE") {
          let station = bike["gsx$station"]["$t"];
          station_status.stations.forEach(gbfsstation => {
            if (gbfsstation.station_id == station) {
              gbfsstation.num_bikes_available++;
              gbfsstation.num_docks_available--;
            }
          });
        }
      });
      return station_status;
    });
}

(async function() {
  var args = process.argv.slice(2);
  var DIR = "gbfs";
  if (args.length == 1) {
    if (fs.existsSync(args[0]) && fs.lstatSync(args[0]).isDirectory()) {
      DIR = args[0];
    } else {
      console.warn(args[0], "is not a directory");
    }
  }

  var sheets = await fetchSheets();

  var index = buildIndex(sheets);
  fs.writeFileSync(path.join(DIR, "gbfs.json"), JSON.stringify(index));

  if (typeof sheets["system"] === "undefined") {
    console.warn(
      "system sheet is missing. not going to write system_information.json"
    );
  } else {
    var system = await loadSystemInfo(sheets["system"]);
    fs.writeFileSync(
      path.join(DIR, "system_information.json"),
      JSON.stringify(system)
    );
  }

  if (typeof sheets["stations"] === "undefined") {
    console.warn(
      "station sheet is missing. not going to write station_information.json"
    );
  } else {
    var station = await loadStationInfo(sheets["stations"]);
    fs.writeFileSync(
      path.join(DIR, "station_information.json"),
      JSON.stringify(station)
    );
  }

  if (typeof sheets["bikes"] === "undefined") {
    console.warn(
      "bike sheet is missing. not going to write station_status.json"
    );
  } else {
    var bikes = await loadBikeInfo(sheets["bikes"]);
    fs.writeFileSync(
      path.join(DIR, "station_status.json"),
      JSON.stringify(bikes)
    );
  }
})();
