GBFS_ENDPOINT = process.env.GBFS_ENDPOINT || "http://gbfs.example.invalid";
LANGUAGE = process.env.LANGUAGE || "de";

GOOGLE_SHEETS_KEY =
  process.env.GOOGLE_SHEETS_KEY ||
  "1OFBnUAaoh3shRO1ZArFxYpad-Xml7dyXgFfrchq0-Uo";
GOOGLE_SHEETS_URL = `https://spreadsheets.google.com/feeds/worksheets/${GOOGLE_SHEETS_KEY}/public/full?alt=json`;

const fs = require("fs");
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

function writeIndex(sheets) {
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
  fs.writeFileSync("gbfs/gbfs.json", JSON.stringify(gbfs_json));
}

function loadSystemInfo(url) {
  return fetch(url)
    .then(res => res.json())
    .then(json => {
      let data = json.feed.entry[0];
      let systemInformation = {
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
      fs.writeFileSync(
        "gbfs/system_information.json",
        JSON.stringify(systemInformation)
      );
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
      fs.writeFileSync(
        "gbfs/station_information.json",
        JSON.stringify(station_information)
      );
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
      fs.writeFileSync(
        "gbfs/station_status.json",
        JSON.stringify(station_status)
      );
    });
}

(async function() {
  var sheets = await fetchSheets();
  await writeIndex(sheets);
  if (typeof sheets["system"] === "undefined") {
    console.warn(
      "system sheet is missing. not going to write system_information.json"
    );
  } else {
    await loadSystemInfo(sheets["system"]);
  }
  if (typeof sheets["stations"] === "undefined") {
    console.warn(
      "station sheet is missing. not going to write station_information.json"
    );
  } else {
    await loadStationInfo(sheets["stations"]);
  }
  if (typeof sheets["bikes"] === "undefined") {
    console.warn(
      "bike sheet is missing. not going to write station_status.json"
    );
  } else {
    await loadBikeInfo(sheets["bikes"]);
  }
})();
