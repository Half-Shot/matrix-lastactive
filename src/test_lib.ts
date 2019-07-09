import { expect } from "chai";
import { MatrixActivityTracker } from "./lib";
import { MatrixPresence, WhoisInfo } from "matrix-bot-sdk";
import { on } from "cluster";

function createTracker(canUseWhois: boolean = false, presence?: MatrixPresence, whois?: WhoisInfo) {
    const tracker: any = new MatrixActivityTracker("https://localhost", "ABCDE", "example.com", !!presence);
    tracker.client.doRequest = async function (method: string, path: string) {
        if (method === "GET" && path === "/_synapse/admin/v1/server_version") {
            if (canUseWhois) {
                return {};
            }
            throw Error("canUseWhois is false");
        }
        if (method === "GET" && path.startsWith("/_matrix/client/r0/presence/")) {
            if (!presence) {
                throw Error("Presence is disabled");
            }
            return presence;
        }
        if (method === "GET" && path.startsWith("/_matrix/client/r0/admin/whois")) {
            if (!whois) {
                throw Error("Whois is disabled");
            }
            return whois;
        }
        throw Error("Path/Method is wrong");
    }
    return {tracker: tracker as MatrixActivityTracker}
}

describe("MatrixActivityTracker", () => {
    it("constructs", () => {
        const tracker = new MatrixActivityTracker("https://localhost", "ABCDE", "example.com", false);
    });
    describe("isUserOnline", () => {
        it("will enable whois if it can't be used", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(true);
            tracker.bumpLastActiveTime("@foobar:example.com");
            await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(tracker.usingWhois).to.be.true;
        });
        it("will disable whois if it can't be used", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(false);
            tracker.bumpLastActiveTime("@foobar:example.com");
            await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(tracker.usingWhois).to.be.false;
        });
        it("Will return online if user was bumped recently", async () => {
            const {tracker} = createTracker(false);
            tracker.bumpLastActiveTime("@foobar:example.com");
            const res = await tracker.isUserOnline("@foobar:example.com", 100);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.be.below(10);
        });
        it("will return online if presence is currently active", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(false, {
                currently_active: true,
                presence: "online"
            });
            const res = await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.equal(0);
        });
        it("will return online if presence status is online", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(false, {
                currently_active: false,
                presence: "online"
            });
            const res = await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.equal(0);
        });
        it("will return offline if presence last_active_ago > maxTime", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(false, {
                currently_active: false,
                presence: "offline",
                last_active_ago: 1001
            });
            const res = await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(1001);
        });
        it("will return offline if canUseWhois is false and presence couldn't be used", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(false);
            const res = await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(-1);
        });
        it("will return offline if user is remote and presence couldn't be used", async () => {
            // Set bumpLastActiveTime to return early.
            const {tracker} = createTracker(true);
            const res = await tracker.isUserOnline("@foobar:notexample.com", 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(-1);
        });
        it("will return online if presence couldn't be used and a device was recently seen", async () => {
            const now = Date.now();
            // Set bumpLastActiveTime to return early.
            const response: WhoisInfo = {
                user_id: "@foobar:notexample.com",
                devices: {
                    foobar: {
                        sessions: [{
                            connections: [{
                                ip: "127.0.0.1",
                                last_seen: now - 500,
                                user_agent: "FakeDevice/1.0.0",
                            },{
                                ip: "127.0.0.1",
                                last_seen: now - 1500,
                                user_agent: "FakeDevice/2.0.0",
                            }],
                        }],
                    },
                    foobar500: {
                        sessions: [{
                            connections: [{
                                ip: "127.0.0.1",
                                last_seen: now - 2500,
                                user_agent: "FakeDevice/3.0.0",
                            }],
                        }],
                    },
                },
            };
            const {tracker} = createTracker(true, undefined, response);

            const res = await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(res.online).to.be.true;
        });
        it("will return offline if presence couldn't be used and a device was not recently seen", async () => {
            const now = Date.now();
            // Set bumpLastActiveTime to return early.
            const response: WhoisInfo = {
                user_id: "@foobar:notexample.com",
                devices: {
                    foobar: {
                        sessions: [{
                            connections: [{
                                ip: "127.0.0.1",
                                last_seen: now - 1000,
                                user_agent: "FakeDevice/1.0.0",
                            },{
                                ip: "127.0.0.1",
                                last_seen: now - 1500,
                                user_agent: "FakeDevice/2.0.0",
                            }],
                        }],
                    },
                    foobar500: {
                        sessions: [{
                            connections: [{
                                ip: "127.0.0.1",
                                last_seen: now - 2500,
                                user_agent: "FakeDevice/3.0.0",
                            }],
                        }],
                    },
                },
            };
            const {tracker} = createTracker(true, undefined, response);

            const res = await tracker.isUserOnline("@foobar:example.com", 1000);
            expect(res.online).to.be.false;
        });
    })
});