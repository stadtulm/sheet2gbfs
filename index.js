GBFS_ENDPOINT = process.env.GBFS_ENDPOINT || "http://gbfs.example.invalid";
LANGUAGE = "de";

GOOGLE_SHEETS_KEY =
  process.env.GOOGLE_SHEETS_KEY ||
  "1OFBnUAaoh3shRO1ZArFxYpad-Xml7dyXgFfrchq0-Uo";
GOOGLE_SHEETS_BIKE_URL = `https://spreadsheets.google.com/feeds/list/${GOOGLE_SHEETS_KEY}/2/public/full?alt=json`;
GOOGLE_SHEETS_STATION_URL = `https://spreadsheets.google.com/feeds/list/${GOOGLE_SHEETS_KEY}/1/public/full?alt=json`;
GOOGLE_SHEETS_SYSTEM_URL = `https://spreadsheets.google.com/feeds/list/${GOOGLE_SHEETS_KEY}/3/public/full?alt=json`;

const fs = require("fs");
const fetch = require("node-fetch");

writeIndex();
loadSystemInfo();
loadStationInfo();

let station_status = {
  stations: []
};

function writeIndex() {
  let gbfs_json = {
    last_updated: Math.floor(new Date() / 1000),
    ttl: 0,
    data: {}
  };
  gbfs_json["data"][LANGUAGE] = {
    feeds: [
      {
        name: "system_information",
        url: GBFS_ENDPOINT + "/system_information.json"
      },
      {
        name: "station_information",
        url: GBFS_ENDPOINT + "/station_information.json"
      },
      {
        name: "station_status",
        url: GBFS_ENDPOINT + "/station_status.json"
      }
    ]
  };
  fs.writeFileSync("gbfs/gbfs.json", JSON.stringify(gbfs_json));
}

function loadSystemInfo() {
  fetch(GOOGLE_SHEETS_SYSTEM_URL).then(res => {
    res.json().then(json => {
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
  });
}

function loadStationInfo() {
  let station_information = {
    stations: []
  };
  fetch(GOOGLE_SHEETS_STATION_URL).then(res => {
    res.json().then(json => {
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
      loadBikeInfo();
    });
  });
}

function loadBikeInfo() {
  fetch(GOOGLE_SHEETS_BIKE_URL).then(res => {
    res.json().then(json => {
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
  });
}
