import { MatrixClient, AdminApis } from "matrix-bot-sdk";

export class MatrixActivityTracker {
    private client: MatrixClient;
    private lastActiveTime: Map<string, number>;
    private canUseWhois: boolean|null = null;
    constructor(homeserverUrl: string, accessToken: string, private serverName: string, private canUsePresence: boolean = true) {
        this.client = new MatrixClient(homeserverUrl, accessToken);
        this.lastActiveTime = new Map();
    }

    public bumpLastActiveTime(userId: string) {
        this.lastActiveTime.set(userId, Date.now());
    }

    public async isUserOnline(userId: string, maxTimeMs: number): Promise<{offline: boolean, inactiveMs: number}> {
        if (this.canUseWhois === null) {
            try {
                await this.client.doRequest("GET", "/_synapse/admin/v1/server_version");
                this.canUseWhois = true;
            } catch (ex) {
                this.canUseWhois = false;
            }
        }

        // First, check if the user has bumped recently.
        const now = Date.now();
        const lastActiveTime = this.lastActiveTime.get(userId);
        if (lastActiveTime) {
            if (now - lastActiveTime < maxTimeMs) {
                // Return early, user has bumped recently.
                return {offline: false, inactiveMs: now - lastActiveTime};
            }
        }
        // The user hasn't interacted with the bridge, or it was too long ago.
        // Check the user's presence.
        try {
            if (this.canUsePresence) {
                const presence = await this.client.getPresenceStatusFor(userId);
                if (presence.currently_active || presence.presence === "online") {
                    return {offline: false, inactiveMs: presence.last_active_ago || 0};
                } else if (presence.last_active_ago !== undefined && presence.last_active_ago > maxTimeMs) {
                    return {offline: true, inactiveMs: presence.last_active_ago};
                } // Otherwise, we can't know conclusively.
            }
        } catch {
            // Failed to get presence, going to fallback to admin api.
        }

        if (!this.canUseWhois || userId.split(":")[1] !== this.serverName) {
            // The user is remote, we don't have any presence for them and they've 
            // not interacted with us so we are going to have to treat them as offline.
            return {offline: false, inactiveMs: -1};
        }

        const whois = await this.client.adminApis.whoisUser(userId);
        const connections = Object.values(whois.devices).flatMap((device) => device.sessions.flatMap((session => session.connections)));
        const lastSeen = connections.sort((conA, conB) => conA.last_seen - conB.last_seen)[0].last_seen;
        return {offline: (now - lastSeen) > maxTimeMs, inactiveMs: now - lastSeen};
    }
}
