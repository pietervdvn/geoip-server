import {IP2Location} from "ip2location-nodejs";
import http from "node:http"

export class Server {
    constructor(
        port: number,
        options: {
            ignorePathPrefix?: string[]
        },
        handle: {
            mustMatch: string | RegExp
            mimetype: string
            addHeaders?: Record<string, string>
            handle: (path: string, queryParams: URLSearchParams, req: http.IncomingMessage) => Promise<string>
        }[]
    ) {
        handle.push({
            mustMatch: "",
            mimetype: "text/html",
            handle: async () => {
                return `<html><body>Supported endpoints are <ul>${handle
                    .filter((h) => h.mustMatch !== "")
                    .map((h) => {
                        let l = h.mustMatch
                        if (typeof h.mustMatch === "string") {
                            l = `<a href='${l}'>${l}</a>`
                        }
                        return "<li>" + l + "</li>"
                    })
                    .join("")}</ul></body></html>`
            },
        })
        http.createServer(async (req: http.IncomingMessage, res) => {
            try {
                const url = new URL(`http://127.0.0.1/` + req.url)
                let path = url.pathname
                while (path.startsWith("/")) {
                    path = path.substring(1)
                }
                console.log(
                    req.method + " " + req.url,
                    "from:",
                    req.headers.origin,
                    new Date().toISOString(),
                    path
                )
                if (options?.ignorePathPrefix) {
                    for (const toIgnore of options.ignorePathPrefix) {
                        if (path.startsWith(toIgnore)) {
                            path = path.substring(toIgnore.length + 1)
                            break
                        }
                    }
                }
                const handler = handle.find((h) => {
                    if (typeof h.mustMatch === "string") {
                        return h.mustMatch === path
                    }
                    if (path.match(h.mustMatch)) {
                        return true
                    }
                })

                if (handler === undefined || handler === null) {
                    res.writeHead(404, {"Content-Type": "text/html"})
                    res.write("<html><body><p>Not found...</p></body></html>")
                    res.end()
                    return
                }

                res.setHeader(
                    "Access-Control-Allow-Headers",
                    "Origin, X-Requested-With, Content-Type, Accept"
                )
                res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*")
                if (req.method === "OPTIONS") {
                    res.setHeader(
                        "Access-Control-Allow-Methods",
                        "POST, GET, OPTIONS, DELETE, UPDATE"
                    )
                    res.writeHead(204, {"Content-Type": handler.mimetype})
                    res.end()
                    return
                }
                if (req.method === "POST" || req.method === "UPDATE") {
                    return
                }

                if (req.method === "DELETE") {
                    return
                }

                try {
                    const result = await handler.handle(path, url.searchParams, req)
                    if (result === undefined) {
                        res.writeHead(500)
                        res.write("Could not fetch this website, probably blocked by them")
                        res.end()
                        return
                    }
                    if (typeof result !== "string") {
                        console.error(
                            "Internal server error: handling",
                            url,
                            "resulted in a ",
                            typeof result,
                            " instead of a string:",
                            result
                        )
                    }
                    const extraHeaders = handler.addHeaders ?? {}
                    res.writeHead(200, {"Content-Type": handler.mimetype, ...extraHeaders})
                    res.write("" + result)
                    res.end()
                } catch (e) {
                    console.error("Could not handle request:", e)
                    res.writeHead(500)
                    res.write(e)
                    res.end()
                }
            } catch (e) {
                console.error("FATAL:", e)
                res.end()
            }
        }).listen(port)
        console.log(
            "Server is running on port " + port,
            ". Supported endpoints are: " + handle.map((h) => h.mustMatch).join(", ")
        )
    }
}

interface IP2LocationResult {
    latitude: string;
    longitude: string;
    region: string;
    countryLong: string;
    countryShort: string;
    ip: string;
    ipNo: string;
}

export class Main {

    private readonly ipv4: IP2Location
    private readonly ipv6: IP2Location

    constructor() {
        console.log("Loading databases from ./data/")
        this.ipv4 = new IP2Location();
        this.ipv4.open("./data/IP2LOCATION-LITE-DB5.BIN");
        console.log("Loaded IPv4 database")
        this.ipv6 = new IP2Location();
        this.ipv6.open("./data/IP2LOCATION-LITE-DB5.IPV6.BIN");
        console.log("Loaded IPv6 database")

        const result = this.ipv4.getAll("78.23.104.174");
        console.log("Testresult on fixed IP address:", result)

        new Server(2347, {},
            [{
                mustMatch: "ip",
                mimetype: "application/json",
                handle: async (path, params, request) => {
                    return JSON.stringify(this.fetchIp(request))
                }
            }])
    }

    private static readonly ipv4Regex = "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"

    private fetchIp(request: http.IncomingMessage): IP2LocationResult {
        //see : https://github.com/kirsch33/realip/issues/14
        const ipAddress = <string>request.headers['HTTP_X_FORWARDED_FOR']
        const db = ipAddress.match(Main.ipv4Regex) ? this.ipv4 : this.ipv6
        return db.getAll(ipAddress)
    }

}

new Main()
