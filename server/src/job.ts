import * as alt from 'alt-server';
import { ServerMarkerController } from '@AthenaServer/streamers/marker';
import { ServerBlipController } from '@AthenaServer/systems/blip';
import { InteractionController } from '@AthenaServer/systems/interaction';
import { Job } from '@AthenaServer/systems/job';
import { MARKER_TYPE } from '@AthenaShared/enums/markerTypes';
import { Objective } from '@AthenaShared/interfaces/job';
import { Vector3 } from '@AthenaShared/interfaces/vector';
import JOB_DATA from './data';
import JobEnums from '../../../../shared/interfaces/job';
import { CurrencyTypes } from '@AthenaShared/enums/currency';
import { Athena } from '@AthenaServer/api/athena';
import { ANIMATION_FLAGS } from '@AthenaShared/flags/animationFlags';
import { distance2d } from '@AthenaShared/utility/vector';
import { command } from '@AthenaServer/decorators/commands';
import { LocaleController } from '@AthenaShared/locale/locale';
import { PERMISSIONS } from '@AthenaShared/flags/permissionFlags';
import { CONFIG_BLIPS_ON, CONFIG_POWER_OFF_AT_SERVER_START } from './config';
import { FarmingUtility } from '@AthenaPlugins/plugin-farmingsystem/server/src/utility';

const COMMAND_POWER_OFF = 'Turn Power Off';
const COMMAND_POWER_ON = 'Turn Power On';
const START_POINT = { x: 2864.176513671875, y: 1510.896484375, z: 23.66752586364746 };
const TOTAL_DROP_OFFS = 2;
const TIME_PER_SPOT = 60000; //in milliseconds
let BlackoutState = CONFIG_POWER_OFF_AT_SERVER_START;

alt.on('playerConnect', (player) => {
    if (BlackoutState === 1) {
        alt.emitAllClients('blackouton');
        alt.log(`Shutdown City Power...`);
    } else {
        alt.log(`Default Power State set to ONLINE...`);
    }
});

export class ActivatePowerJob {
    /**
     * Turn Power Off
     * @param player
     * @private
     */
    @command('poweroff', LocaleController.get(COMMAND_POWER_OFF, '/poweroff'), PERMISSIONS.ADMIN)
    private static powerOff(player: alt.Player) {
        if (!player || !player.valid) {
            return;
        }

        alt.emitAllClients('blackouton');
        ActivatePowerJob.setPowerOn('false');
        Athena.player.emit.message(player, `Power is Off`);
    }

    /**
     * Turn Power On
     * @param player
     * @private
     */
    @command('poweron', LocaleController.get(COMMAND_POWER_ON, '/poweron'), PERMISSIONS.ADMIN)
    private static powerOn(player: alt.Player) {
        if (!player || !player.valid) {
            return;
        }

        alt.emitAllClients('blackoutoff');
        ActivatePowerJob.setPowerOn('true');
        Athena.player.emit.message(player, `Power is On`);
    }

    /**
     * Create In-World Job Location(s)
     * @static
     * @memberof Job
     */
    static init() {
        if (CONFIG_BLIPS_ON) {
            ServerBlipController.append({
                sprite: 480,
                color: 5,
                pos: START_POINT,
                scale: 0.6,
                shortRange: true,
                text: 'Repair Power Outage',
            });
        }

        ServerMarkerController.append({
            pos: START_POINT,
            color: new alt.RGBA(255, 255, 255, 150),
            type: MARKER_TYPE.CYLINDER,
            scale: new alt.Vector3(1, 1, 1),
        });

        InteractionController.add({
            callback: ActivatePowerJob.begin,
            description: 'Repair Power to get the Lights back',
            position: START_POINT,
            range: 2,
            isPlayerOnly: true,
        });
    }

    static readBlackoutState() {
        //1 = BlackOut is active
        //alt.log("readBlackoutState is: ", BlackoutState);
        if (BlackoutState === 1) {
            return true;
        } else {
            return false;
        }
    }

    static setPowerOn(state: string) {
        //alt.log("Power is now: ", state);
        if (state === 'true') {
            BlackoutState = 0;
            return;
        } else {
            BlackoutState = 1;
            return;
        }
    }

    /**
     * Call this to start the job. Usually called through interaction point.
     * @static
     * @param {alt.Player} player
     * @memberof Job
     */
    static async begin(player: alt.Player) {
        if (BlackoutState === 0) {
            Athena.player.emit.notification(player, `~r~Power is already Online...`);
            return;
        }

        const openSpot = await ActivatePowerJob.getStartingPoint();
        if (!openSpot) {
            Athena.player.emit.notification(player, `~r~No room for starting the job. Please wait...`);
            return;
        }

        const randomPoints1 = ActivatePowerJob.getRandomPoints1(TOTAL_DROP_OFFS);
        const objectives: Array<Objective> = [];
        objectives.push({
            description: 'Start Repair job',
            type: JobEnums.ObjectiveType.WAYPOINT,
            pos: openSpot.pos,
            range: 4,
            marker: {
                pos: {
                    x: openSpot.pos.x,
                    y: openSpot.pos.y,
                    z: openSpot.pos.z - 1,
                },
                type: MARKER_TYPE.CYLINDER,
                color: new alt.RGBA(0, 255, 0, 100),
            },
            textLabel: {
                data: 'Get your Tools',
                pos: {
                    x: openSpot.pos.x,
                    y: openSpot.pos.y,
                    z: openSpot.pos.z + 1.5,
                },
            },
            blip: {
                text: 'Repair Spot',
                color: 2,
                pos: openSpot.pos,
                scale: 1,
                shortRange: true,
                sprite: 271,
            },
            criteria: JobEnums.ObjectiveCriteria.NO_DYING,
            callbackOnStart: (player: alt.Player) => {
                Athena.player.emit.message(player, '/quitjob - To stop this job.');
            },
        });

        for (let i = 0; i < randomPoints1.length; i++) {
            const rPoint1 = randomPoints1[i];
            objectives.push({
                description: '...',
                type: JobEnums.ObjectiveType.WAYPOINT,
                pos: rPoint1,
                range: 2,
                marker: {
                    pos: rPoint1,
                    type: MARKER_TYPE.CYLINDER,
                    color: new alt.RGBA(0, 255, 0, 100),
                },
                textLabel: {
                    data: 'Repair Spot',
                    pos: {
                        x: rPoint1.x,
                        y: rPoint1.y,
                        z: rPoint1.z + 1.5,
                    },
                },
                blip: {
                    text: 'Repair Spot',
                    color: 2,
                    pos: rPoint1,
                    scale: 1,
                    shortRange: true,
                    sprite: 271,
                },
                criteria: JobEnums.ObjectiveCriteria.NO_DYING,
                callbackOnStart: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `You got the Tools...`);
                },
                callbackOnFinish: (player: alt.Player) => {},
            });
        }

        const randomPoints2 = ActivatePowerJob.getRandomPoints2(TOTAL_DROP_OFFS);
        for (let i = 0; i < randomPoints2.length; i++) {
            const rPoint2 = randomPoints2[i];
            objectives.push({
                description: '...',
                type: JobEnums.ObjectiveType.WAYPOINT,
                pos: rPoint2,
                range: 2,
                marker: {
                    pos: rPoint2,
                    type: MARKER_TYPE.CYLINDER,
                    color: new alt.RGBA(0, 255, 0, 100),
                },
                textLabel: {
                    data: 'Repair Spot',
                    pos: {
                        x: rPoint2.x,
                        y: rPoint2.y,
                        z: rPoint2.z + 1.5,
                    },
                },
                blip: {
                    text: 'Repair Spot',
                    color: 2,
                    pos: rPoint2,
                    scale: 1,
                    shortRange: true,
                    sprite: 271,
                },
                criteria: JobEnums.ObjectiveCriteria.NO_DYING,
                callbackOnStart: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `SPOT: 1`);
                    Athena.player.safe.setPosition(player, player.pos.x, player.pos.y, player.pos.z);
                    Athena.player.emit.animation(
                        player,
                        `amb@world_human_hammering@male@base`,
                        'base',
                        ANIMATION_FLAGS.NORMAL | ANIMATION_FLAGS.REPEAT,
                        TIME_PER_SPOT,
                    );
                    Athena.player.set.frozen(player, true);
                    ActivatePowerJob.getProgressBar(player);
                    alt.setTimeout(async () => {
                        Athena.player.set.frozen(player, false);
                        Athena.player.emit.soundFrontend(
                            player,
                            'Hack_Success',
                            'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS',
                        );
                        Athena.player.emit.notification(player, `go to the next spot`);
                    }, TIME_PER_SPOT);
                },
                callbackOnFinish: (player: alt.Player) => {},
            });
        }

        const randomPoints3 = ActivatePowerJob.getRandomPoints3(TOTAL_DROP_OFFS);
        for (let i = 0; i < randomPoints3.length; i++) {
            const rPoint3 = randomPoints3[i];
            const distance3 = distance2d(player.pos, rPoint3);
            objectives.push({
                description: '...',
                type: JobEnums.ObjectiveType.WAYPOINT,
                pos: rPoint3,
                range: 2,
                marker: {
                    pos: rPoint3,
                    type: MARKER_TYPE.CYLINDER,
                    color: new alt.RGBA(0, 255, 0, 100),
                },
                textLabel: {
                    data: 'Repair Spot',
                    pos: {
                        x: rPoint3.x,
                        y: rPoint3.y,
                        z: rPoint3.z + 1.5,
                    },
                },
                blip: {
                    text: 'Repair Spot',
                    color: 2,
                    pos: rPoint3,
                    scale: 1,
                    shortRange: true,
                    sprite: 271,
                },
                criteria: JobEnums.ObjectiveCriteria.NO_DYING,
                callbackOnStart: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `SPOT: 2`);
                    Athena.player.safe.setPosition(player, player.pos.x, player.pos.y, player.pos.z);
                    Athena.player.emit.animation(
                        player,
                        `amb@world_human_hammering@male@base`,
                        'base',
                        ANIMATION_FLAGS.NORMAL | ANIMATION_FLAGS.REPEAT,
                        TIME_PER_SPOT,
                    );
                    Athena.player.set.frozen(player, true);

                    alt.setTimeout(async () => {
                        Athena.player.set.frozen(player, false);
                        Athena.player.emit.soundFrontend(
                            player,
                            'Hack_Success',
                            'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS',
                        );
                        Athena.player.emit.notification(player, `go to the next spot`);
                    }, TIME_PER_SPOT);
                },
                callbackOnFinish: (player: alt.Player) => {},
            });
        }

        const randomPoints4 = ActivatePowerJob.getRandomPoints4(TOTAL_DROP_OFFS);
        for (let i = 0; i < randomPoints4.length; i++) {
            const rPoint4 = randomPoints4[i];
            objectives.push({
                description: '...',
                type: JobEnums.ObjectiveType.WAYPOINT,
                pos: rPoint4,
                range: 2,
                marker: {
                    pos: rPoint4,
                    type: MARKER_TYPE.CYLINDER,
                    color: new alt.RGBA(0, 255, 0, 100),
                },
                textLabel: {
                    data: 'Repair Spot',
                    pos: {
                        x: rPoint4.x,
                        y: rPoint4.y,
                        z: rPoint4.z + 1.5,
                    },
                },
                blip: {
                    text: 'Repair Spot',
                    color: 2,
                    pos: rPoint4,
                    scale: 1,
                    shortRange: true,
                    sprite: 271,
                },
                criteria: JobEnums.ObjectiveCriteria.NO_DYING,
                callbackOnStart: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `SPOT: 3`);
                    Athena.player.safe.setPosition(player, player.pos.x, player.pos.y, player.pos.z);
                    Athena.player.emit.animation(
                        player,
                        `amb@world_human_hammering@male@base`,
                        'base',
                        ANIMATION_FLAGS.NORMAL | ANIMATION_FLAGS.REPEAT,
                        TIME_PER_SPOT,
                    );
                    Athena.player.set.frozen(player, true);
                    ActivatePowerJob.getProgressBar(player);
                    alt.setTimeout(async () => {
                        Athena.player.set.frozen(player, false);
                        Athena.player.emit.soundFrontend(
                            player,
                            'Hack_Success',
                            'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS',
                        );
                        Athena.player.emit.notification(player, `go to the next spot`);
                    }, TIME_PER_SPOT);
                },
                callbackOnFinish: (player: alt.Player) => {},
            });
        }

        const randomPoints5 = ActivatePowerJob.getRandomPoints5(TOTAL_DROP_OFFS);
        for (let i = 0; i < randomPoints5.length; i++) {
            const rPoint5 = randomPoints5[i];
            const distance5 = distance2d(player.pos, rPoint5);
            objectives.push({
                description: '...',
                type: JobEnums.ObjectiveType.WAYPOINT,
                pos: rPoint5,
                range: 2,
                marker: {
                    pos: rPoint5,
                    type: MARKER_TYPE.CYLINDER,
                    color: new alt.RGBA(0, 255, 0, 100),
                },
                textLabel: {
                    data: 'Repair Spot',
                    pos: {
                        x: rPoint5.x,
                        y: rPoint5.y,
                        z: rPoint5.z + 1.5,
                    },
                },
                blip: {
                    text: 'Repair Spot',
                    color: 2,
                    pos: rPoint5,
                    scale: 1,
                    shortRange: true,
                    sprite: 271,
                },
                criteria: JobEnums.ObjectiveCriteria.NO_DYING,
                callbackOnStart: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `SPOT: 4`);
                    Athena.player.safe.setPosition(player, player.pos.x, player.pos.y, player.pos.z);
                    Athena.player.emit.animation(
                        player,
                        `amb@world_human_hammering@male@base`,
                        'base',
                        ANIMATION_FLAGS.NORMAL | ANIMATION_FLAGS.REPEAT,
                        TIME_PER_SPOT,
                    );
                    Athena.player.set.frozen(player, true);

                    alt.setTimeout(async () => {
                        Athena.player.set.frozen(player, false);
                        Athena.player.emit.soundFrontend(
                            player,
                            'Hack_Success',
                            'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS',
                        );
                        Athena.player.emit.notification(player, `go to the next spot`);
                    }, TIME_PER_SPOT);
                },
                callbackOnFinish: (player: alt.Player) => {},
            });
        }

        const randomPoints6 = ActivatePowerJob.getRandomPoints6(TOTAL_DROP_OFFS);
        for (let i = 0; i < randomPoints6.length; i++) {
            const rPoint6 = randomPoints6[i];
            const distance6 = distance2d(player.pos, rPoint6);
            objectives.push({
                description: '...',
                type: JobEnums.ObjectiveType.WAYPOINT,
                pos: rPoint6,
                range: 2,
                marker: {
                    pos: rPoint6,
                    type: MARKER_TYPE.CYLINDER,
                    color: new alt.RGBA(0, 255, 0, 100),
                },
                textLabel: {
                    data: 'Repair Spot',
                    pos: {
                        x: rPoint6.x,
                        y: rPoint6.y,
                        z: rPoint6.z + 1.5,
                    },
                },
                blip: {
                    text: 'Repair Spot',
                    color: 2,
                    pos: rPoint6,
                    scale: 1,
                    shortRange: true,
                    sprite: 271,
                },
                criteria: JobEnums.ObjectiveCriteria.NO_DYING,
                callbackOnStart: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `SPOT: 5`);
                    Athena.player.safe.setPosition(player, player.pos.x, player.pos.y, player.pos.z);
                    Athena.player.emit.animation(
                        player,
                        `amb@world_human_hammering@male@base`,
                        'base',
                        ANIMATION_FLAGS.NORMAL | ANIMATION_FLAGS.REPEAT,
                        TIME_PER_SPOT,
                    );
                    Athena.player.set.frozen(player, true);
                    ActivatePowerJob.getProgressBar(player);
                    alt.setTimeout(async () => {
                        Athena.player.set.frozen(player, false);
                        Athena.player.emit.soundFrontend(
                            player,
                            'Hack_Success',
                            'DLC_HEIST_BIOLAB_PREP_HACKING_SOUNDS',
                        );
                    }, TIME_PER_SPOT);
                },
                callbackOnFinish: (player: alt.Player) => {
                    Athena.player.emit.notification(player, `Power Repaired bring your tools back!`);
                },
            });
        }

        objectives.push({
            description: 'Drop Off our Tools',
            type: JobEnums.ObjectiveType.WAYPOINT,
            pos: openSpot.pos,
            range: 4,
            marker: {
                pos: {
                    x: openSpot.pos.x,
                    y: openSpot.pos.y,
                    z: openSpot.pos.z - 1,
                },
                type: MARKER_TYPE.CYLINDER,
                color: new alt.RGBA(0, 255, 0, 100),
            },
            blip: {
                text: 'Bring your Tools back',
                color: 2,
                pos: openSpot.pos,
                scale: 1,
                shortRange: true,
                sprite: 271,
            },
            textLabel: {
                data: 'Bring your Tools back',
                pos: {
                    x: openSpot.pos.x,
                    y: openSpot.pos.y,
                    z: openSpot.pos.z + 1.5,
                },
            },
            criteria: JobEnums.ObjectiveCriteria.NO_DYING,
            callbackOnStart: (player: alt.Player) => {
                Athena.player.emit.notification(player, `Bring your Tools back`);
            },
            callbackOnFinish: (player: alt.Player) => {
                if (BlackoutState === 1) {
                    alt.emitAllClients('blackoutoff');
                    BlackoutState = 0;
                    Athena.player.emit.notification(player, `Repair Job Done. Power is Online!`);
                    alt.log(`INFO: Power was Repaired...`);
                }
            },
        });

        const job = new Job();
        job.loadObjectives(objectives);
        job.addPlayer(player);
    }

    /**
     * Creates and checks if a vehicle is in a spot and returns a spot if it is open.
     * @static
     * @return {({ pos: Vector3; rot: Vector3 })}
     * @memberof SearchSuppliesJob
     */
    static async getStartingPoint(): Promise<{ pos: Vector3; rot: Vector3 }> {
        for (let i = 0; i < JOB_DATA.STARTING_POINT.length; i++) {
            const point = JOB_DATA.STARTING_POINT[i];
            const pointTest = new alt.ColshapeSphere(point.pos.x, point.pos.y, point.pos.z - 1, 2);

            // Have to do a small sleep to the ColShape propogates entities inside of it.
            await new Promise((resolve: Function) => {
                alt.setTimeout(() => {
                    resolve();
                }, 250);
            });

            const spaceOccupied = alt.Player.all.find((player) => pointTest.isEntityIn(player));

            try {
                pointTest.destroy();
            } catch (err) {}

            if (spaceOccupied) {
                continue;
            }

            return point;
        }

        return null;
    }

    static getProgressBar(player: alt.Player) {
        Athena.player.emit.createProgressBar(player, {
            uid: Date.now().toString(),
            color: new alt.RGBA(0, 255, 0, 200),
            distance: 10,
            milliseconds: TIME_PER_SPOT,
            position: player.pos,
            text: 'Repairing...',
            percentageEnabled: true,
        });
    }

    /**
     * Get random point from list of points.
     * @static
     * @return {Array<Vector3>}
     * @memberof Job
     */
    static getRandomPoints1(amount: number): Array<Vector3> {
        const points = [];

        while (points.length < amount) {
            points.push(JOB_DATA.DROP_OFF_SPOTS1[Math.floor(Math.random() * JOB_DATA.DROP_OFF_SPOTS1.length)]);
        }

        return points;
    }

    static getRandomPoints2(amount: number): Array<Vector3> {
        const points = [];

        while (points.length < amount) {
            points.push(JOB_DATA.DROP_OFF_SPOTS2[Math.floor(Math.random() * JOB_DATA.DROP_OFF_SPOTS2.length)]);
        }

        return points;
    }

    static getRandomPoints3(amount: number): Array<Vector3> {
        const points = [];

        while (points.length < amount) {
            points.push(JOB_DATA.DROP_OFF_SPOTS3[Math.floor(Math.random() * JOB_DATA.DROP_OFF_SPOTS3.length)]);
        }

        return points;
    }

    static getRandomPoints4(amount: number): Array<Vector3> {
        const points = [];

        while (points.length < amount) {
            points.push(JOB_DATA.DROP_OFF_SPOTS4[Math.floor(Math.random() * JOB_DATA.DROP_OFF_SPOTS4.length)]);
        }

        return points;
    }

    static getRandomPoints5(amount: number): Array<Vector3> {
        const points = [];

        while (points.length < amount) {
            points.push(JOB_DATA.DROP_OFF_SPOTS5[Math.floor(Math.random() * JOB_DATA.DROP_OFF_SPOTS5.length)]);
        }

        return points;
    }

    static getRandomPoints6(amount: number): Array<Vector3> {
        const points = [];

        while (points.length < amount) {
            points.push(JOB_DATA.DROP_OFF_SPOTS6[Math.floor(Math.random() * JOB_DATA.DROP_OFF_SPOTS6.length)]);
        }

        return points;
    }
}
