var http = require("http")
var https = require("https")
var domain = require("domain")
var Wolfram = require("wolfram-alpha")
var MsTranslator = require("mstranslator")
var logger = require("./logger")

var APIs = {

	// API call to anagramgenius.com
	"anagram": function(msg, apikey, callback) {
		var options = {
			host: "anagramgenius.com",
			path: "/server.php?" + "source_text=" + encodeURI(msg) + "&vulgar=1",
			timeout: 20
		}

		urlRetrieve(http, options, function(status, data) {
			data = data.match(/.*<span class=\"black-18\">'(.*)'<\/span>/)
			callback(data)
		})
	},

	// API call to wolframalpha.com
	"wolfram": function(query, apikey, callback) {
		var client = Wolfram.createClient(apikey);
		client.query(query, function(err, result) {
			if (!result)
				return callback("WolframAlpha query failed")

			// Look for the primary answer
			for (var i = 0; i < result.length; i++) {
				if (result[i]["primary"])
					return callback(result[i]["subpods"][0]["text"])
			}

			// We couldn't find one, pick the next thing after
			// the input pod with data
			for (var i = 1; i < result.length; i++) {
				if (result[i]["subpods"][0]["text"])
					return callback(result[i]["subpods"][0]["text"])
			}

			// We couldn't find anything
			return callback("WolframAlpha query failed")
		})
	},

	// API call to weatherunderground.com for weather
	"weather": function(data, apikey, callback) {
		var query = ""
		var options = {}

		if (data.split(" ").length === 1) {
			options = {
				host: "api.wunderground.com",
				path: "/api/" + apikey + "/conditions/q/" + data + ".json",
				timeout: 20
			}

			urlRetrieve(http, options, function(status, data) {
				callback(data)
			})
			return
		}

		try {
			var stringData = data.split(" ")

			// Strip off the country
			var country = stringData[stringData.length - 1]
			stringData.splice(stringData.length - 1, 1)

			var fixedString = ""

			// Put the location together for the query
			for (var k in stringData) {
				fixedString += stringData[k] + "_"
			}

			// Trim off the last _
			fixedString = fixedString.slice(0, fixedString.lastIndexOf("_"))

			query = country + "/" + fixedString
			options = {
				host: "api.wunderground.com",
				path: "/api/" + apikey + "/conditions/q/" + query + ".json",
				timeout: 20
			}

			urlRetrieve(http, options, function(status, data) {
				return callback(data)
			})
		} catch (e) {
			logger.errlog.log(e)
		}
	}, // end weather

	// API call to weatherunderground.com for forecasts
	"forecast": function(data, apikey, callback) {
		var query = ""

		var options = {}

		if (data.split(" ").length === 1) {
			options = {
				host: "api.wunderground.com",
				path: "/api/" + apikey + "/conditions/forecast/q/" + data + ".json",
				timeout: 20
			}

			urlRetrieve(http, options, function(status, data) {
				callback(data)
			})
			return
		}

		try {
			var stringData = data.split(" ")

			// Strip off the country
			var country = stringData[stringData.length - 1]
			stringData.splice(stringData.length - 1, 1)

			var fixedString = ""

			// Put the location together for the query
			for (var k in stringData) {
				fixedString += stringData[k] + "_"
			}

			// Trim off the last _
			fixedString = fixedString.slice(0, fixedString.lastIndexOf("_"))

			query = country + "/" + fixedString
			options = {
				host: "api.wunderground.com",
				path: "/api/" + apikey + "/conditions/forecast/q/" + query + ".json",
				timeout: 20
			}

			urlRetrieve(http, options, function(status, data) {
				return callback(data)
			})
		} catch (e) {
			logger.errlog.log(e)
		}

	}, // End forecast

	// Attempts to get the socketurl from a cytube server
	"socketlookup": function(server, apiKeys, callback) {
		var options = {
			host: server,
			path: "/sioconfig",
			timeout: 20
		}

		urlRetrieve(http, options, function(res, data) {
			// If we can't find the URL there's something wrong and
			// we should exit
			if (res !== 200) {
				logger.errlog.log("!~~~! Error looking up Cytube server info")
				process.exit(1)
			}

			var defaultReg = new RegExp(";var IO_URL=['? | \"?](.*)['? | \"?];")
			if (data.match(defaultReg)) {
				callback(data.match(defaultReg)[1])
			}
		})
	},

	// API call to Microsoft Translate
	"translate": function(query, apiKeys, callback) {
		var mst_id = apiKeys["clientid"]
		var mst_secret = apiKeys["secret"]
		var client = new MsTranslator({
			client_id: mst_id,
			client_secret: mst_secret
		})

		client.initialize_token(function(keys) {
			client.translate(query, function(err, data) {
				if (err)
					return logger.errlog.log(err)

				callback(data)
			})
		})
	},

	// API call for YouTube videos
	// Used to validate videos
	"youtubelookup": function(id, apiKey, callback) {
		var params = [
			"part=" + "id,snippet,contentDetails,status",
			"id=" + id,
			"key=" + apiKey
		].join("&")

		var options = {
			host: "www.googleapis.com",
			port: 443,
			path: "/youtube/v3/videos?" + params,
			method: "GET",
			dataType: "jsonp",
			timeout: 1000
		}

		urlRetrieve(https, options, function(status, data) {
			if (status !== 200) {
				callback(status, null)
				return
			}

			data = JSON.parse(data)
			if (data.pageInfo.totalResults !== 1) {
				callback("Video not found", null)
				return
			}

			var vidInfo = {
				id: data["items"][0]["id"],
				contentDetails: data["items"][0]["contentDetails"],
				status: data["items"][0]["status"]
			}

			callback(true, vidInfo)
		})
	}
}

var urlRetrieve = function(transport, options, callback) {
	var dom = domain.create()
	dom.on("error", function(err) {
		logger.errlog.log(err.stack)
		logger.errlog.log("urlRetrieve failed: " + err)
		logger.errlog.log("Request was: " + options.host + options.path)
		callback(503, err)
	})
	dom.run(function() {
		var req = transport.request(options, function(res) {
			var buffer = ""
			res.setEncoding("utf-8")
			res.on("data", function(chunk) {
				buffer += chunk
			})
			res.on("end", function() {
				callback(res.statusCode, buffer)
			})
		})

		req.end()
	})
};

module.exports = {
	APIs: APIs,
	APICall: function(msg, type, apikey, callback) {
		if (type in this.APIs)
			this.APIs[type](msg, apikey, callback)
	},
	retrieve: urlRetrieve
}