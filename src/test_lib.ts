import { expect } from "chai";
import { MatrixActivityTracker } from "./lib";
import { WhoisInfo, PresenceEventContent, Presence } from "matrix-bot-sdk";

const TEST_USER = "@foobar:example.com";

function createTracker(canUseWhois: boolean = false, presence?: PresenceEventContent, whois?: WhoisInfo, defaultOnline: boolean = false) {
    const tracker: any = new MatrixActivityTracker({
        homeserverUrl: "https://localhost",
        accessToken: "ABCDE",
        serverName: "example.com",
        usePresence: !!presence,
        defaultOnline,
    });
    tracker.client.doRequest = async function (method: string, path: string) {
        if (method === "POST" && path === "/_synapse/admin/v1/send_server_notice") {
            if (canUseWhois) {
                throw {statusCode: 400}
            }
            throw {statusCode: 403}; // 403 - not an admin
        }
        if (method === "GET" && path.startsWith("/_matrix/client/r0/presence/")) {
            if (!presence) {
                throw Error("Presence is disabled");
            }
            return new Presence(presence);
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
        const tracker: any = new MatrixActivityTracker({
            homeserverUrl: "https://localhost",
            accessToken: "ABCDE",
            serverName: "example.com",
            defaultOnline: false,
        });
    });
    describe("isUserOnline", () => {
        it("will enable whois if it can be used", async () => {
            const {tracker} = createTracker(true);
            tracker.bumpLastActiveTime(TEST_USER);
            await tracker.isUserOnline(TEST_USER, 1000);
            expect(tracker.usingWhois).to.be.true;
        });
        it("will disable whois if it can't be used", async () => {
            const {tracker} = createTracker(false);
            tracker.bumpLastActiveTime(TEST_USER);
            await tracker.isUserOnline(TEST_USER, 1000);
            expect(tracker.usingWhois).to.be.false;
        });
        it("Will return online if user was bumped recently", async () => {
            const {tracker} = createTracker(false);
            tracker.bumpLastActiveTime(TEST_USER);
            const res = await tracker.isUserOnline(TEST_USER, 100);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.be.below(10);
        });
        it("will return online if presence is currently active", async () => {
            const {tracker} = createTracker(false, {
                currently_active: true,
                presence: "online",
            });
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.equal(0);
        });
        it("will return online if presence status is online", async () => {
            const {tracker} = createTracker(false, {
                currently_active: false,
                presence: "online"
            });
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.equal(0);
        });
        it("will return offline if presence last_active_ago > maxTime", async () => {
            const {tracker} = createTracker(false, {
                currently_active: false,
                presence: "offline",
                last_active_ago: 1001
            });
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(1001);
        });
        it("will return offline if canUseWhois is false and presence couldn't be used", async () => {
            const {tracker} = createTracker(false);
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(-1);
        });
        it("will return online if the user's time is set appropriately", async () => {
            const {tracker} = createTracker(false);
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(-1);
            const time = Date.now();
            await tracker.setLastActiveTime(TEST_USER, time);
            const res2 = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res2.online).to.be.true;
            expect(res2.inactiveMs).to.be.lessThan(100); // Account for some time spent.
        });
        it("will return online if presence couldn't be used and a device was recently seen", async () => {
            const now = Date.now();
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

            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.true;
        });
        it("will return offline if presence couldn't be used and a device was not recently seen", async () => {
            const now = Date.now();
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

            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.false;
        });
        it("will default to offline if configured to", async () => {
            const {tracker} = createTracker(false, undefined, undefined, false);
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(-1);
        });
        it("will default to online if configured to", async () => {
            const {tracker} = createTracker(false, undefined, undefined, true);
            const res = await tracker.isUserOnline(TEST_USER, 1000);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.equal(-1);
        });
        it("will be online if defaultOnline is overriden", async () => {
            const {tracker} = createTracker(false, undefined, undefined, false);
            const res = await tracker.isUserOnline(TEST_USER, 1000, true);
            expect(res.online).to.be.true;
            expect(res.inactiveMs).to.equal(-1);
        });
        it("will be offline if defaultOnline is overriden", async () => {
            const {tracker} = createTracker(false, undefined, undefined, true);
            const res = await tracker.isUserOnline(TEST_USER, 1000, false);
            expect(res.online).to.be.false;
            expect(res.inactiveMs).to.equal(-1);
        });
    })
});