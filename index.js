GBFS_ENDPOINT = "http://mylittleendpoint/"
SYSTEM_ID = "radforschung_camp"
SYSTEM_NAME = "Campy Mc Campbike"
SYSTEM_WEB_URL = "https://radforschung.org/"
SYSTEM_TIMEZONE = "Europe/Berlin"

GOOGLE_SHEETS_BIKE_URL = "https://spreadsheets.google.com/feeds/list/1OFBnUAaoh3shRO1ZArFxYpad-Xml7dyXgFfrchq0-Uo/2/public/full?alt=json"
GOOGLE_SHEETS_STATION_URL = "https://spreadsheets.google.com/feeds/list/1OFBnUAaoh3shRO1ZArFxYpad-Xml7dyXgFfrchq0-Uo/1/public/full?alt=json"

const fs = require("fs")
const fetch = require('node-fetch');

writeSystemInfo()
loadStationInfo()

let station_status = {
	stations: []
}

function writeSystemInfo(){
	let gbfs_json = {
		"last_updated": Math.floor(new Date() / 1000),
		"ttl": 0,
		"data": {
			"de": {
				"feeds": [
					{
						"name": "system_information",
						"url": GBFS_ENDPOINT + "system_information.json"
					},
					{
						"name": "station_information",
						"url": GBFS_ENDPOINT + "station_information.json"
					},
					{
						"name": "station_status",
						"url": GBFS_ENDPOINT + "station_status.json"
					}
				]
			}
		}
	}
	fs.writeFileSync('gbfs/gbfs.json', JSON.stringify(gbfs_json));

	let systemInformation = {
		"last_updated": Math.floor(new Date() / 1000),
		"ttl": 0,
		"data": {
			"system_id": SYSTEM_ID,
			"language": "de",
			"name": SYSTEM_NAME,
			"url": SYSTEM_WEB_URL,
			"timezone": SYSTEM_TIMEZONE,
			"license_url": "http://www.wtfpl.net/txt/copying"
		}
	}
	fs.writeFileSync('gbfs/system_information.json', JSON.stringify(systemInformation));
}

function loadStationInfo() {
	let station_information = {
		stations: []
	}
	fetch(GOOGLE_SHEETS_STATION_URL).then((res)=>{
		res.json().then(json=>{
			json.feed.entry.forEach(station => {
				let gbfsStation = {
					station_id: station["gsx$stationid"]["$t"],
					name: station["gsx$name"]["$t"],
					lat: parseFloat(station["gsx$lat"]["$t"]),
					lon: parseFloat(station["gsx$lon"]["$t"])
				}
				station_information.stations.push(gbfsStation)
				
				let active = (station["gsx$active"]["$t"] == "YES") ? true : false
				let docks = (station["gsx$maxbikes"]["$t"] == "") ? 10 : parseInt(station["gsx$maxbikes"]["$t"], 10)
				let gbfsStationStatus = {
					station_id: station["gsx$stationid"]["$t"],
					num_bikes_available: 0,
					num_docks_available: docks,
					is_installed: active,
					is_renting: active,
					is_returning: active
				}
				station_status.stations.push(gbfsStationStatus)
			})
			fs.writeFileSync('gbfs/station_information.json', JSON.stringify(station_information));
			loadBikeInfo()
		})
	})
}

function loadBikeInfo() {
	fetch(GOOGLE_SHEETS_BIKE_URL).then((res)=>{
		res.json().then(json=>{
			json.feed.entry.forEach(bike => {
				if (bike["gsx$status"]["$t"] == "AVAILABLE"){
					let station = bike["gsx$station"]["$t"]
					station_status.stations.forEach((gbfsstation)=>{
						if (gbfsstation.station_id == station){
							gbfsstation.num_bikes_available++;
							gbfsstation.num_docks_available--;
						}
					})
				}
			})
			fs.writeFileSync('gbfs/station_status.json', JSON.stringify(station_status));
		})
	})
}