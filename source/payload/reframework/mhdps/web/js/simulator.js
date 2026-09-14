/**
 * MHDPS - Interactive Combat Simulator
 * Generates realistic real-time ticks for Wilds, World, and Rise
 * so the user can test the UI on their 2nd screen immediately without launching a game.
 */
class MHDPSCombatSimulator {
    constructor() {
        this.isRunning = false;
        this.timer = null;
        this.currentGame = 'wilds'; // 'wilds' | 'world' | 'rise'
        this.questTime = 0;
        this.monsterHp = 100.0;
        this.mockState = null;
    }

    initGameScenario(game = 'wilds') {
        this.currentGame = game;
        this.questTime = 12.0;
        this.monsterHp = 100.0;

        if (game === 'wilds') {
            this.mockState = {
                game: 'wilds',
                quest: {
                    status: 'in_progress',
                    timeSeconds: this.questTime,
                    monster: 'Rey Dau (Donnerkeil)',
                    monsterHpPercent: 100.0,
                    targetHp: 48500
                },
                players: [
                    {
                        id: 0,
                        isSelf: true,
                        name: "Rixx",
                        hr: 48,
                        mr: 0,
                        weapon: "GreatSword",
                        damage: 1850,
                        dps: 154.1,
                        damageShare: 35.0,
                        highestHit: 780,
                        highestCrit: 1140,
                        monsterHits: 18,
                        rangeType: "Nahkampf",
                        details: {
                            element: "Thunder",
                            rawDamage: 1450,
                            elementDamage: 400,
                            healingDone: 0,
                            knockouts: 1,
                            stuns: 1,
                            paralyze: 0,
                            sleep: 0,
                            woundsOpened: 4,
                            focusStrikes: 3,
                            companionDamage: 210
                        }
                    },
                    {
                        id: 1,
                        isSelf: false,
                        name: "Sylvia_LS",
                        hr: 62,
                        mr: 0,
                        weapon: "LongSword",
                        damage: 1520,
                        dps: 126.6,
                        damageShare: 28.7,
                        highestHit: 290,
                        highestCrit: 410,
                        monsterHits: 44,
                        rangeType: "Nahkampf",
                        details: {
                            element: "Dragon",
                            rawDamage: 1280,
                            elementDamage: 240,
                            healingDone: 80,
                            knockouts: 0,
                            stuns: 0,
                            paralyze: 0,
                            sleep: 0,
                            woundsOpened: 2,
                            focusStrikes: 2,
                            companionDamage: 180
                        }
                    },
                    {
                        id: 2,
                        isSelf: false,
                        name: "Nora_HH",
                        hr: 55,
                        mr: 0,
                        weapon: "HuntingHorn",
                        damage: 980,
                        dps: 81.6,
                        damageShare: 18.5,
                        highestHit: 220,
                        highestCrit: 310,
                        monsterHits: 28,
                        rangeType: "Nahkampf",
                        details: {
                            element: "Water",
                            rawDamage: 820,
                            elementDamage: 160,
                            healingDone: 650,
                            knockouts: 1,
                            stuns: 1,
                            paralyze: 1,
                            sleep: 0,
                            woundsOpened: 1,
                            focusStrikes: 1,
                            companionDamage: 320
                        }
                    },
                    {
                        id: 3,
                        isSelf: false,
                        name: "Kaelen_Gun",
                        hr: 39,
                        mr: 0,
                        weapon: "HeavyBowgun",
                        damage: 940,
                        dps: 78.3,
                        damageShare: 17.8,
                        highestHit: 340,
                        highestCrit: 480,
                        monsterHits: 56,
                        rangeType: "Fernkampf",
                        details: {
                            element: "Fire",
                            rawDamage: 720,
                            elementDamage: 220,
                            healingDone: 120,
                            knockouts: 0,
                            stuns: 0,
                            paralyze: 0,
                            sleep: 1,
                            woundsOpened: 3,
                            focusStrikes: 2,
                            companionDamage: 110
                        }
                    }
                ]
            };
        } else if (game === 'world') {
            this.mockState = {
                game: 'world',
                quest: {
                    status: 'in_progress',
                    timeSeconds: this.questTime,
                    monster: 'Fatalis (Schwarzer Drache)',
                    monsterHpPercent: 100.0,
                    targetHp: 66000
                },
                players: [
                    {
                        id: 0,
                        isSelf: true,
                        name: "Rixx",
                        hr: 240,
                        mr: 185,
                        weapon: "ChargeBlade",
                        damage: 2400,
                        dps: 200.0,
                        damageShare: 32.5,
                        details: {
                            element: "Dragon",
                            rawDamage: 1800,
                            elementDamage: 600,
                            healingDone: 150,
                            knockouts: 1,
                            stuns: 1,
                            paralyze: 0,
                            sleep: 0,
                            tenderizes: 5,
                            wallBangs: 2,
                            companionDamage: 450
                        }
                    },
                    {
                        id: 1,
                        isSelf: false,
                        name: "ShadowHunter",
                        hr: 500,
                        mr: 420,
                        weapon: "DualBlades",
                        damage: 2250,
                        dps: 187.5,
                        damageShare: 30.4,
                        details: {
                            element: "Dragon",
                            rawDamage: 1100,
                            elementDamage: 1150,
                            healingDone: 0,
                            knockouts: 0,
                            stuns: 0,
                            paralyze: 0,
                            sleep: 0,
                            tenderizes: 2,
                            wallBangs: 1,
                            companionDamage: 380
                        }
                    },
                    {
                        id: 2,
                        isSelf: false,
                        name: "Aiden_SnS",
                        hr: 180,
                        mr: 130,
                        weapon: "SwordAndShield",
                        damage: 1540,
                        dps: 128.3,
                        damageShare: 20.8,
                        details: {
                            element: "Fire",
                            rawDamage: 1200,
                            elementDamage: 340,
                            healingDone: 890,
                            knockouts: 1,
                            stuns: 1,
                            paralyze: 0,
                            sleep: 0,
                            tenderizes: 6,
                            wallBangs: 3,
                            companionDamage: 290
                        }
                    },
                    {
                        id: 3,
                        isSelf: false,
                        name: "Robin_Bow",
                        hr: 310,
                        mr: 240,
                        weapon: "Bow",
                        damage: 1200,
                        dps: 100.0,
                        damageShare: 16.3,
                        details: {
                            element: "Ice",
                            rawDamage: 480,
                            elementDamage: 720,
                            healingDone: 0,
                            knockouts: 0,
                            stuns: 0,
                            paralyze: 1,
                            sleep: 1,
                            tenderizes: 1,
                            wallBangs: 0,
                            companionDamage: 180
                        }
                    }
                ]
            };
        } else {
            // Rise / Sunbreak
            this.mockState = {
                game: 'rise',
                quest: {
                    status: 'in_progress',
                    timeSeconds: this.questTime,
                    monster: 'Urvater Malzeno',
                    monsterHpPercent: 100.0,
                    targetHp: 52000
                },
                players: [
                    {
                        id: 0,
                        isSelf: true,
                        name: "Rixx",
                        hr: 350,
                        mr: 190,
                        weapon: "SwitchAxe",
                        damage: 2800,
                        dps: 233.3,
                        damageShare: 36.1,
                        details: {
                            element: "Dragon",
                            rawDamage: 2100,
                            elementDamage: 700,
                            healingDone: 0,
                            knockouts: 0,
                            stuns: 0,
                            paralyze: 1,
                            sleep: 0,
                            wyvernRides: 1,
                            wirebugCounters: 7,
                            companionDamage: 540
                        }
                    },
                    {
                        id: 1,
                        isSelf: false,
                        name: "Kamura_Ninja",
                        hr: 420,
                        mr: 260,
                        weapon: "InsectGlaive",
                        damage: 2100,
                        dps: 175.0,
                        damageShare: 27.1,
                        details: {
                            element: "Ice",
                            rawDamage: 1550,
                            elementDamage: 550,
                            healingDone: 180,
                            knockouts: 1,
                            stuns: 1,
                            paralyze: 0,
                            sleep: 0,
                            wyvernRides: 2,
                            wirebugCounters: 4,
                            companionDamage: 490
                        }
                    },
                    {
                        id: 2,
                        isSelf: false,
                        name: "BonkMaster",
                        hr: 280,
                        mr: 150,
                        weapon: "Hammer",
                        damage: 1750,
                        dps: 145.8,
                        damageShare: 22.5,
                        details: {
                            element: "Thunder",
                            rawDamage: 1500,
                            elementDamage: 250,
                            healingDone: 0,
                            knockouts: 3,
                            stuns: 3,
                            paralyze: 0,
                            sleep: 0,
                            wyvernRides: 0,
                            wirebugCounters: 5,
                            companionDamage: 380
                        }
                    },
                    {
                        id: 3,
                        isSelf: false,
                        name: "Utsushi_Fan",
                        hr: 190,
                        mr: 95,
                        weapon: "LightBowgun",
                        damage: 1110,
                        dps: 92.5,
                        damageShare: 14.3,
                        details: {
                            element: "Water",
                            rawDamage: 710,
                            elementDamage: 400,
                            healingDone: 350,
                            knockouts: 0,
                            stuns: 0,
                            paralyze: 1,
                            sleep: 1,
                            wyvernRides: 0,
                            wirebugCounters: 2,
                            companionDamage: 260
                        }
                    }
                ]
            };
        }
    }

    start(game = 'wilds') {
        if (this.isRunning) this.stop();
        this.initGameScenario(game);
        this.isRunning = true;

        this.timer = setInterval(() => {
            this.tick();
        }, 300); // 300ms realistic refresh tick
    }

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    tick() {
        if (!this.mockState) return;

        this.questTime += 0.3;
        this.mockState.quest.timeSeconds = Math.round(this.questTime * 10) / 10;

        // Simulate combat ticks for each player
        let totalDamage = 0;
        this.mockState.players.forEach(player => {
            // Random hit damage between 15 and 280 depending on weapon
            if (Math.random() > 0.3) {
                const isCrit = Math.random() > 0.65;
                let hitBase = Math.floor(Math.random() * 95) + 20;
                
                // Big hit for GreatSword / Hammer / ChargeBlade
                if (player.weapon === "GreatSword" && Math.random() > 0.8) {
                    hitBase = Math.floor(Math.random() * 300) + 400; // True Charged Slash!
                }

                const hit = isCrit ? Math.floor(hitBase * 1.35) : hitBase;

                player.damage += hit;
                player.monsterHits = (player.monsterHits || 0) + 1;
                player.details.rawDamage += Math.round(hit * 0.75);
                player.details.elementDamage += Math.round(hit * 0.25);

                // Update highest hit / highest crit
                if (hit > (player.highestHit || 0)) {
                    player.highestHit = hit;
                }
                if (isCrit && hit > (player.highestCrit || 0)) {
                    player.highestCrit = hit;
                }
            }

            // Occasional companion tick
            if (Math.random() > 0.6) {
                player.details.companionDamage += Math.floor(Math.random() * 30) + 10;
            }

            // Occasional heal
            if (player.name.includes("Support") || player.weapon === "HuntingHorn" || player.weapon === "SwordAndShield") {
                if (Math.random() > 0.85) player.details.healingDone += 60;
            }

            // DPS calculation
            player.dps = Math.round((player.damage / Math.max(1, this.questTime)) * 10) / 10;
            totalDamage += player.damage;
        });

        // Update damage percentages
        this.mockState.players.forEach(p => {
            p.damageShare = totalDamage > 0 ? Math.round((p.damage / totalDamage) * 1000) / 10 : 0;
        });

        // Monster HP progression
        const targetHp = this.mockState.quest.targetHp || 50000;
        const currentHp = Math.max(0, targetHp - totalDamage);
        this.mockState.quest.monsterHp = Math.max(0,currentHp);
        this.mockState.quest.parts = [
            {id:'1',kind:'durability',hp:Math.max(0,900-(this.questTime*17)%900),maxHp:900},
            {id:'2',kind:'durability',hp:Math.max(0,650-(this.questTime*9)%650),maxHp:650},
            {id:'3',kind:'durability',hp:Math.max(0,1100-(this.questTime*12)%1100),maxHp:1100}
        ];
        this.mockState.quest.monsterHpPercent = Math.max(0, Math.round((currentHp / targetHp) * 1000) / 10);

        if (this.mockState.quest.monsterHpPercent <= 0) {
            this.mockState.quest.status = 'completed';
        }

        // Emit through MHDPSConnection
        window.MHDPSConnection.notifyData(this.mockState);
    }
}

window.MHDPSCombatSimulator = new MHDPSCombatSimulator();
