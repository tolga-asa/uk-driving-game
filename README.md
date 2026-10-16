# Keep Left: UK driving practice

A top-down driving game for practising UK roads. Double-click `index.html` to play it in Chrome. It is one file, needs no install and works offline. Send that one file to someone and it works for them too.

## The map

Four areas, each with the road features UK drivers and examiners find hardest:

- **Ashford Green (suburbs):** a double mini-roundabout, a single mini-roundabout, a small roundabout, a staggered crossroads, an unmarked crossroads, a STOP junction, a 20 mph school street with speed humps, zebra crossings, parked cars to pass, and a pinch point with priority signs.
- **Kingsgate (city centre):** one-way streets forming a clockwise one-way loop (like a gyratory), Kingsway with bus lanes both ways, yellow box junctions, cyclists' boxes (advanced stop lines) at the lights, light-controlled pedestrian crossings, 20 mph zones, buses and black cabs.
- **A40 bypass:** a 70 mph dual carriageway with a central reservation, linking a single-lane roundabout, a two-lane roundabout with lane arrows, a roundabout with traffic lights, and a gap junction where a side road crosses both carriageways.
- **Countryside and Little Mardon:** winding 60 mph lanes between hedges with chevron signs at sharp bends, a railway with four level crossings and trains, tractors, a village with a 30 mph gateway, a mini-roundabout, a pub and a church, and a single-track lane with passing places.

## Handling

Keys are on or off, so the car smooths them out the way good arcade driving games do. Pedals press in gradually, about 4.5 s to 30 mph. The steering wheel turns in steadily and centres itself, and steering lock reduces as speed rises (speed-sensitive steering). The car turns using a simple wheelbase model, runs wide if you overcook a bend, and only slides with the handbrake.

- **Lane assist** (`K`): Strong keeps you centred in your lane when you let go of the keys, Light only lines you up with the road, Off is fully manual.
- **Speed limiter** (`L`): holds you at the current limit.

## How it marks you

Faults are marked like the real practical test: 15 or fewer driving faults and no serious or dangerous faults is a pass.

| Rule | Fault |
|---|---|
| Keep left (Rule 160) | Serious after 3 s on the right-hand side, unless you are passing parked cars or a slow vehicle |
| One-way streets | Dangerous for driving the wrong way |
| Speed limits (Rule 124) | Minor for going over, serious for 10 mph or more over; minor for hitting speed humps above 18 mph |
| Traffic lights, puffin crossings (Rules 176, 196) | Serious for red or red + amber; minor for stopping in the cyclists' box (Rule 178) |
| Roundabouts (Rules 185–189) | Serious for not giving way to the right, dangerous for going anticlockwise, minor for the wrong lane or a missing signal, minor for driving over a mini-roundabout |
| Junctions (Rules 146, 171–174, 180) | Serious for pulling out in front of main-road traffic, not stopping at a STOP sign, or turning right across oncoming traffic; minor for stopping in a box junction |
| Meeting traffic (Rule 163) | Serious for passing an obstruction on your side when traffic is coming |
| Lanes (Rules 137, 141) | Minor for driving in a bus lane or staying in the overtaking lane of the dual carriageway |
| Crossings (Rule 195), level crossings (Rule 293) | Serious for driving onto a crossing someone is using; dangerous for crossing when the level-crossing lights show |
| Signals (Rule 103) | Minor for turning without signalling, or signalling and going straight on |
| Collisions, pavement | Serious; hitting a pedestrian or being hit by a train is dangerous; leaving the road onto grass is minor |

A theory question appears every 75 seconds (you can change this). There are 93 questions, and after a mistake the next question is on the rule you broke. Press `P` for the test sheet, laid out like the examiner's DL25 form.

## Controls

Arrow keys or WASD to drive, `Q` / `E` indicators, `Space` handbrake, `L` speed limiter, `K` lane assist, `H` horn, `C` camera (behind the car or north-up map), `T` theory question now, `P` pause. Phones and tablets get on-screen buttons. Choose where to start on the title screen.

## Development

```
src/core.js                 road network: roads as lane polylines, junctions, spatial index, signals, railway
src/map.js                  the map layout and street furniture (crossings, humps, parked cars, level crossings)
src/scenery.js              buildings by district, trees, fields, road signs
src/traffic.js, traffic2.js AI route planning and driving, pedestrians
src/player.js, rules.js     car handling and collisions; UK rule checks
src/render.js, render2.js   canvas drawing and minimap
src/ui.js, main.js          HUD, questions, test sheet, input, sound, game loop
src/questions*.js           theory question bank
build.mjs                   inlines everything into index.html
```

```
node build.mjs                   # rebuild index.html after editing src/
node tests/map.test.cjs          # roads only meet at junctions; every junction reachable by legal driving
node tests/traffic.test.cjs 4    # 4 simulated minutes of traffic: no gridlock, nobody off-road or on the wrong side
```

The game is for practice. Always check the official Highway Code and DVSA material before your test.
