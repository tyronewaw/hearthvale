# Hearthvale villager voices: recording sheet

48 short clips in five voices. The villagers speak a made-up, friendly tribal language, so the words are nonsense on purpose: say them as written.

The game already has a take of every line, made with VoxCPM2 from these same voice descriptions (`scripts/voicegen/`; the five designed voices are in `voices/refs/`). To replace any line with your own take, make it in VoiceStudio as below and send it: a file with the same name replaces the game's.

## In VoiceStudio

1. **Engine: VoxCPM2** (Model Catalogue). It is Apache-2.0, so its output can ship in the game, and it can *design* a voice from a description, so no real person's voice is cloned.
   - Do **not** use the default OmniVoice engine: its weights are non-commercial only. Avoid Llama-OuteTTS (non-commercial) and Chatterbox (licence unclear) too.
   - Your Radeon runs VoxCPM2 on the CPU on Windows. That is fine for clips this short.
2. Open **Voice design**. For each voice below, paste its description, generate a test line, and keep regenerating until you like it. Note the **seed** if there is one, and reuse the same description and seed for every line in that voice so it stays the same person.
3. For each line, put the text in the text box and the "how" note in the **Style** field. Generate 2 or 3 takes and keep the best.
4. Export as **WAV** (or FLAC/MP3) named **exactly** as the File column, e.g. `throw_1.wav`. Don't worry about silence at the ends or loudness: I trim, level and convert everything.
5. Put all the files in one folder, zip it, and attach the zip in our chat. Send only the ones you want to replace; the rest stay as they are.

## The voices

- **blue_warm**: A warm, cheerful young woman with a soft, friendly, playful voice. (13 lines)
- **blue_jolly**: A friendly, jolly man in his thirties with a hearty, round voice and a laugh in it. (12 lines)
- **blue_kid**: An excited, giggly child with a high, bouncy voice. (11 lines)
- **red_deep**: A deep, rumbling, good-natured older man with a slow, earthy voice. (6 lines)
- **red_bright**: A bright, lively woman with a strong, rhythmic, slightly husky voice. (6 lines)

## blue_warm

> Voice design: *A warm, cheerful young woman with a soft, friendly, playful voice.*

| File | Say | How (Style) |
|---|---|---|
| `pickup_1.wav` | Eep! | quick surprised squeak |
| `throw_3.wav` | Yaaah! | short excited shout |
| `land_2.wav` | Owa! | quick, then a little giggle |
| `drop_1.wav` | Nala! | quick, content |
| `job_2.wav` | Ya-ya! | quick and willing |
| `newhome_1.wav` | Hoya! | short happy cheer |
| `grow_2.wav` | Yaay! | short cheer |
| `festival_2.wav` | La-la-hey! | sing-song cheer |
| `splash_3.wav` | Splish! | quick and startled |
| `chatter_1.wav` | Mela tuka? | quick chatty murmur |
| `chatter_3.wav` | Ooh, sola. | quick curious murmur |
| `chatter_6.wav` | Hmm, nala. | quick content hum |
| `petplay_2.wav` | Hee hee! | quick giggle |

## blue_jolly

> Voice design: *A friendly, jolly man in his thirties with a hearty, round voice and a laugh in it.*

| File | Say | How (Style) |
|---|---|---|
| `pickup_2.wav` | Whoa-hup! | quick, surprised |
| `throw_2.wav` | Wa-hoo! | short happy holler |
| `land_1.wav` | Oof! | short grunt |
| `drop_2.wav` | Toka! | quick, cheerful |
| `job_1.wav` | Hoi! Kuma! | quick and eager |
| `newhome_2.wav` | Ha-ha! Toma! | short hearty cheer |
| `grow_1.wav` | Bigga! | short proud cheer |
| `festival_1.wav` | Hoya, hoya! | chanting cheer |
| `splash_2.wav` | Brrr! | quick and shivering |
| `chatter_2.wav` | Nanu, kora. | quick mumble |
| `chatter_4.wav` | Ta-ki, hm. | quick thoughtful mumble |
| `petplay_3.wav` | Ho-ho! | short hearty laugh |

## blue_kid

> Voice design: *An excited, giggly child with a high, bouncy voice.*

| File | Say | How (Style) |
|---|---|---|
| `pickup_3.wav` | Eee! | quick delighted squeal |
| `throw_1.wav` | Wheee! | short joyful shout |
| `land_3.wav` | Bonk! | quick and cheeky |
| `drop_3.wav` | Hehe! | quick giggle |
| `job_3.wav` | Okee! | quick and keen |
| `newhome_3.wav` | Oooh! | short and amazed |
| `grow_3.wav` | Wow-wow! | quick and amazed |
| `festival_3.wav` | Woo-hoo! | excited cheer |
| `splash_1.wav` | Blub! | quick and spluttering |
| `chatter_5.wav` | Mumu! | quick and playful |
| `petplay_1.wav` | Aww! Nunu! | quick and delighted |

## red_deep

> Voice design: *A deep, rumbling, good-natured older man with a slow, earthy voice.*

| File | Say | How (Style) |
|---|---|---|
| `red_pickup_1.wav` | Hrrm?! | short startled grumble |
| `red_join_2.wav` | Ombu... hoya! | short smile, then a cheer |
| `red_fest_1.wav` | Roka, hey! | short chant |
| `red_fest_3.wav` | Hoom, ha! | short chant |
| `red_chatter_1.wav` | Roka, umba. | quick low mumble |
| `red_chatter_3.wav` | Ombu. | short low mumble |

## red_bright

> Voice design: *A bright, lively woman with a strong, rhythmic, slightly husky voice.*

| File | Say | How (Style) |
|---|---|---|
| `red_pickup_2.wav` | Ombu?! | quick and startled |
| `red_join_1.wav` | Hoya! Nala! | quick and happy |
| `red_join_3.wav` | Doru-ka! | quick and cheerful |
| `red_fest_2.wav` | Oom-ba! | short chant |
| `red_chatter_2.wav` | Ho-mo, doru! | quick and chatty |
| `red_chatter_4.wav` | Daka-ree? | quick and curious |

## When each line plays

- `pickup_*`: picked up by the god hand
- `throw_*`: flying through the air after a throw
- `land_*`: landing after a throw, dizzy but fine
- `drop_*`: put down gently
- `job_*`: given a job on a building
- `newhome_*`: a new home is founded
- `grow_*`: a home grows a level
- `festival_*`: a festival starts
- `splash_*`: landing in the water
- `chatter_*`: idle chatter near the camera
- `petplay_*`: the pet plays nearby
- `red_pickup_*`: a Red villager is picked up
- `red_join_*`: a Red home or villager joins us
- `red_fest_*`: a Red festival starts
- `red_chatter_*`: Red idle chatter near the camera
