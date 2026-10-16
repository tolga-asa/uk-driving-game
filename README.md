# Keep Left: UK driving practice

A top-down driving game for practising UK roads. Double-click `index.html` to play it in Chrome. It is one file, needs no install and works offline. Send that one file to someone and it works for them too.

You drive round a small English town and the 60 mph A-road around it. The town has:

- roundabouts (clockwise, give way to the right), traffic lights with the UK red → red + amber → green → amber sequence, and give-way junctions
- zebra crossings with Belisha beacons, zigzag lines and pedestrians who step out
- 20, 30 and national speed limit (60 mph) streets, with signs
- AI traffic that keeps left, signals and queues; pedestrians on the pavements

## How it marks you

Faults are marked like the real practical test: 15 or fewer driving faults and no serious or dangerous faults is a pass. The game checks:

| Rule | Fault |
|---|---|
| Keep left (Rule 160) | Serious after 3 s on the right-hand side; a KEEP LEFT sign flashes after 0.6 s |
| Speed limits (Rule 124) | Minor for going over, serious for 10 mph or more over |
| Red / red + amber light (Rule 176) | Serious |
| Roundabouts (Rules 185, 186) | Serious for not giving way to the right, dangerous for going anticlockwise, minor for missing the signal on left or right exits |
| Give-way junctions (Rule 172) | Serious for pulling out in front of main-road traffic |
| Zebra crossings (Rule 195) | Serious for driving onto a crossing someone is using |
| Signals (Rule 103) | Minor for turning without signalling, or signalling and going straight on |
| Collisions, driving on the pavement | Serious; hitting a pedestrian is dangerous; leaving the road onto grass is minor |

Every 75 seconds (you can change this) a theory question appears. There are 73 questions on speed limits, stopping distances, roundabouts, lights, crossings, junctions, signs, motorways and the law. After a mistake, the next question is on the rule you broke. Press `P` for the test sheet, laid out like the examiner's DL25 form.

## Controls

Arrow keys or WASD to drive, `Q` / `E` indicators, `Space` handbrake, `H` horn, `C` camera (behind the car or north-up map), `T` theory question now, `P` pause. Phones and tablets get on-screen buttons.

## Development

```
src/questions.js, questions2.js   theory question bank
src/world.js                      town map, junction types, traffic-light sequence, location queries
src/traffic.js                    AI cars and pedestrians
src/player.js                     car handling and the rule checks
src/render.js                     canvas drawing and minimap
src/ui.js, main.js                HUD, questions, test sheet, input, sound, game loop
src/game.html, styles.css         markup and styles
build.mjs                         inlines everything into index.html
```

```
node build.mjs                 # rebuild index.html after editing src/
```

The game is for practice. Always check the official Highway Code and DVSA material before your test.
