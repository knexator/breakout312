import { BlendModes } from "shaku/lib/gfx";
import Shaku from "shaku/lib/shaku";
import TextureAsset from "shaku/lib/assets/texture_asset";
import * as dat from 'dat.gui';
import Color from "shaku/lib/utils/color";
import Vector2 from "shaku/lib/utils/vector2";
import Circle from "shaku/lib/utils/circle";
import Rectangle from "shaku/lib/utils/rectangle";

const CONFIG = {
    ball_speed: 500,
    ball_radius: 10,

    brick_w: 100,
    brick_h: 40,

    only_orange: true,
};
let gui = new dat.GUI({});
gui.remember(CONFIG);
gui.add(CONFIG, "only_orange");
gui.add(CONFIG, "ball_speed", 0, 800);
gui.add(CONFIG, "ball_radius", 0, 20);

const UNDO_COLORS = [
    '#CFCFCF',
    '#FF9500',
    '#E74059',
    '#9D15EC',
].map(x => Color.fromHex(x));

// init shaku
await Shaku.init();

// add shaku's canvas to document and set resolution to 800x600
document.body.appendChild(Shaku!.gfx!.canvas);
Shaku.gfx!.setResolution(800, 600, true);
// Shaku.gfx!.centerCanvas();
// Shaku.gfx!.maximizeCanvasSize(false, false);

// Loading Screen
Shaku.startFrame();
Shaku.gfx!.clear(Shaku.utils.Color.cornflowerblue);
Shaku.endFrame();

// TODO: INIT STUFF AND LOAD ASSETS HERE
// let soundAsset = await Shaku.assets.loadSound('sounds/example_sound.wav');
// let soundInstance = Shaku.sfx!.createSound(soundAsset);

// let texture = await Shaku.assets.loadTexture('imgs/example_image.png', null);
// let sprite = new Shaku.gfx!.Sprite(texture);
// sprite.position.set(Shaku.gfx!.canvas.width / 2, Shaku.gfx!.canvas.height / 2);

/** Each frame, store what level of undo is being performed (0 = none, 1 = Z, etc) */
let true_timeline_undos: number[] = [0];
let real_tick = 0;

let paused = false;

let ball_pos: Vector2[] = [new Vector2(CONFIG.ball_radius * 2, CONFIG.ball_radius * 2)];  // [Shaku.gfx.getCanvasSize().mul(.5)];
let ball_vel: Vector2[] = [Vector2.one];

/** element i is position of brick i */
let bricks_rects: Rectangle[] = [];
let bricks_inmunity: number[] = [];
/** element i is history of brick i */
let bricks_broken: boolean[][] = [];

for (let i = 1; i < 7; i++) {
    for (let j = 3; j < 9; j++) {
        bricks_rects.push(new Rectangle(i * CONFIG.brick_w, j * CONFIG.brick_h, CONFIG.brick_w, CONFIG.brick_h));
        bricks_inmunity.push(Math.floor(Math.random() * 3));
        bricks_broken.push([false]);
    }
}

function get_original_tick(tick: number, max_inmune_to: number) {
    // for an object inmune to max_inmune levels of time travel,
    // when the real time is "tick", get the last real tick where
    // their free will was executed. Without time travel, it would
    // always be cur_tick itself; in Braid, for green objects, which
    // have max_inmune = 1, it will always be cur_tick (if there hasn't
    // been a "real undo") (or level 2, at least)

    if (tick <= 0) {
        // console.log("that's before time!");
        return tick
    } else if (tick > true_timeline_undos.length) {
        // console.log("that's the far future!")
        return tick
    } else if (true_timeline_undos[tick - 1] <= max_inmune_to) {
        // console.log("that's a good-ol-regular tick.")
        return tick
    } else {
        let travel_depth = true_timeline_undos[tick - 1]
        let counter = 1
        let res = tick - 1
        while (counter > 0 && res > 0) {
            let cur_depth = true_timeline_undos[res - 1]
            if (cur_depth == travel_depth) {
                counter += 1
                res -= 1
            } else if (cur_depth < travel_depth) {
                counter -= 1
                res -= 1
            } else {
                // higher level travel over here!
                res = get_original_tick(res, max_inmune_to)
            }
        }
        // console.log("time traveling to: ", res)
        return res
    }
}

// do a single main loop step and request the next step
function step() {
    // start a new frame and clear screen
    Shaku.startFrame();
    Shaku.gfx!.clear(Shaku.utils.Color.cornflowerblue);

    if (Shaku.input.pressed("space")) {
        paused = !paused;
    }
    if (!paused) {



        let cur_undo = 0;
        for (let i = 0; i < 4; i++) {
            if (Shaku.input.down('zxcv'[i])) cur_undo = i + 1
        }
        true_timeline_undos.push(cur_undo);
        real_tick += 1;

        let board_area = new Rectangle(CONFIG.ball_radius, CONFIG.ball_radius, Shaku.gfx.getCanvasSize().x - CONFIG.ball_radius * 2, Shaku.gfx.getCanvasSize().y - CONFIG.ball_radius * 2);

        for (let k = 0; k < bricks_rects.length; k++) {
            let brick_tick = get_original_tick(real_tick, CONFIG.only_orange ? 1 : bricks_inmunity[k]);
            if (bricks_broken[k][brick_tick] !== undefined) {
                // repeating history
                bricks_broken[k][real_tick] = bricks_broken[k][brick_tick];
            } else {
                // creating history
                bricks_broken[k][real_tick] = bricks_broken[k][real_tick - 1];
            }
        }

        // player isn't inmune to any undo level
        let player_tick = get_original_tick(real_tick, 0);
        if (ball_pos[player_tick] !== undefined) {
            // repeating history
            console.log("repeating history");
            ball_pos[real_tick] = ball_pos[player_tick];
            ball_vel[real_tick] = ball_vel[player_tick];
        } else {
            // creating history
            console.log("creating history");
            let old_pos = ball_pos[real_tick - 1];
            let new_pos = old_pos.add(ball_vel[real_tick - 1].mul(Shaku.gameTime.delta * CONFIG.ball_speed));
            let new_vel = ball_vel[real_tick - 1].clone();

            if (new_pos.x < board_area.left) {
                new_vel.x *= -1;
                new_pos.x += (board_area.left - new_pos.x) * 2;
            } else if (new_pos.x > board_area.right) {
                new_vel.x *= -1;
                new_pos.x += (board_area.right - new_pos.x) * 2;
            } else if (new_pos.y < board_area.top) {
                new_vel.y *= -1;
                new_pos.y += (board_area.top - new_pos.y) * 2;
            } else if (new_pos.y > board_area.bottom) {
                new_vel.y *= -1;
                new_pos.y += (board_area.bottom - new_pos.y) * 2;
            }

            for (let k = 0; k < bricks_rects.length; k++) {
                if (bricks_broken[k][real_tick]) continue;

                if (bricks_rects[k].collideCircle(new Circle(new_pos, CONFIG.ball_radius))) {
                    console.log("collision ", k);
                    bricks_broken[k][real_tick] = true;
                    if (old_pos.y <= bricks_rects[k].top || old_pos.y >= bricks_rects[k].bottom) {
                        new_vel.y *= -1;
                    } else {
                        new_vel.x *= -1;
                    }
                    break;
                }
            }

            ball_pos[real_tick] = new_pos;
            ball_vel[real_tick] = new_vel;
        }

    }

    Shaku.gfx.fillCircle(new Circle(ball_pos[real_tick], CONFIG.ball_radius), Color.white);

    for (let k = 0; k < bricks_rects.length; k++) {
        if (!bricks_broken[k][real_tick]) {
            Shaku.gfx.fillRect(bricks_rects[k], UNDO_COLORS[CONFIG.only_orange ? 1 : bricks_inmunity[k]])
        }
    }

    // end frame and request next step
    Shaku.endFrame();
    Shaku.requestAnimationFrame(step);
}

// start main loop
step();
