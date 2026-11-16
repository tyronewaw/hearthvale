# Hearthvale villager voices: recording sheet

48 short clips in five voices. The villagers speak a made-up, friendly tribal language, so the words are nonsense on purpose: say them as written.

## In VoiceStudio

1. **Engine: VoxCPM2** (Model Catalogue). It is Apache-2.0, so its output can ship in the game, and it can *design* a voice from a description, so no real person's voice is cloned.
   - Do **not** use the default OmniVoice engine: its weights are non-commercial only. Avoid Llama-OuteTTS (non-commercial) and Chatterbox (licence unclear) too.
   - Your Radeon runs VoxCPM2 on the CPU on Windows. That is fine for clips this short.
2. Open **Voice design**. For each voice below, paste its description, generate a test line, and keep regenerating until you like it. Note the **seed** if there is one, and reuse the same description and seed for every line in that voice so it stays the same person.
3. For each line, put the text in the text box and the "how" note in the **Style** field. Generate 2 or 3 takes and keep the best.
4. Export as **WAV** (or FLAC/MP3) named **exactly** as the File column, e.g. `throw_1.wav`. Don't worry about silence at the ends or loudness: I trim, level and convert everything.
5. Put all the files in one folder, zip it, and attach the zip in our chat. Missing a few is fine: the game falls back to its own sounds for anything not there yet.

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
| `pickup_1.wav` | Eep! Hoh? | surprised little squeak |
| `throw_3.wav` | Yiii-haaa! | excited, laughing |
| `land_2.wav` | Ow-wa... hee hee! | dizzy giggle |
| `drop_1.wav` | Mm, nala. | soft and content |
| `job_2.wav` | Ya-ya, kuma-ree! | cheerful agreement |
| `newhome_1.wav` | Hoya! Nala-hom! | joyful cheer |
| `grow_2.wav` | Yaaay, ma-reee! | delighted cheer |
| `festival_2.wav` | La-la-hey! La-la-ho! | sing-song, dancing |
| `splash_3.wav` | Ah! Splish! | startled, then giggly |
| `chatter_1.wav` | Mela tuka, ha? | quiet, chatting to a friend |
| `chatter_3.wav` | Ooh, sola-ree. | gentle, admiring |
| `chatter_6.wav` | Hmm-hmm, nala-nala. | humming contentedly |
| `petplay_2.wav` | Hee hee! Pip-pip! | giggling |

## blue_jolly

> Voice design: *A friendly, jolly man in his thirties with a hearty, round voice and a laugh in it.*

| File | Say | How (Style) |
|---|---|---|
| `pickup_2.wav` | Whoa-ho! Hup! | surprised, then amused |
| `throw_2.wav` | Wa-hoooo! | big happy holler |
| `land_1.wav` | Oof! Heh... toka. | winded, then chuckling |
| `drop_2.wav` | Ah! Toka-toka. | pleased, settling in |
| `job_1.wav` | Hoi! Kuma! | keen, ready to work |
| `newhome_2.wav` | Ha-ha! Toma, toma! | triumphant laugh |
| `grow_1.wav` | Oooh! Bigga-toma! | impressed, warm |
| `festival_1.wav` | Hoya, hoya, hoya! | rhythmic party chant |
| `splash_2.wav` | Brrr! Wa-wa! | shivering, surprised |
| `chatter_2.wav` | Nanu, nanu, kora. | relaxed, murmuring |
| `chatter_4.wav` | Ta-ki, ta-ki... hm. | thoughtful, humming |
| `petplay_3.wav` | Ho-ho! Nunu-ka! | fond laugh |

## blue_kid

> Voice design: *An excited, giggly child with a high, bouncy voice.*

| File | Say | How (Style) |
|---|---|---|
| `pickup_3.wav` | Eee! Up-up! | delighted squeal |
| `throw_1.wav` | Wheeeee! | long joyful shout, like a fairground ride |
| `land_3.wav` | Bonk! Muka-muka! | giddy, wants another go |
| `drop_3.wav` | Hehe, pi! | small happy giggle |
| `job_3.wav` | Okee, tuka! | proud and eager |
| `newhome_3.wav` | Ooooh! Hom-hom! | amazed and happy |
| `grow_3.wav` | Wow-wow! Biggaaa! | wide-eyed excitement |
| `festival_3.wav` | Woo-hoo! Ka-ta, ka-ta! | wild happy cheer |
| `splash_1.wav` | Blub! Pfffft! | spluttering, laughing |
| `chatter_5.wav` | Hehe, mumu! | playful whisper |
| `petplay_1.wav` | Aww! Nunu-nunu! | adoring |

## red_deep

> Voice design: *A deep, rumbling, good-natured older man with a slow, earthy voice.*

| File | Say | How (Style) |
|---|---|---|
| `red_pickup_1.wav` | Hrrm?! Doru?! | startled, grumbly |
| `red_join_2.wav` | Ombu... hoya, hoya! | slow smile, then a cheer |
| `red_fest_1.wav` | Roka-roka, HEY! | booming party shout |
| `red_fest_3.wav` | Hoom, hoom, ha! | rhythmic and jolly |
| `red_chatter_1.wav` | Roka... umba. | low, relaxed murmur |
| `red_chatter_3.wav` | Ombu, ombu. | content rumble |

## red_bright

> Voice design: *A bright, lively woman with a strong, rhythmic, slightly husky voice.*

| File | Say | How (Style) |
|---|---|---|
| `red_pickup_2.wav` | Ha! Ombu?! | surprised exclamation |
| `red_join_1.wav` | Ah... hoya! Nala! | won over, warm and happy |
| `red_join_3.wav` | Doru-ka! Ha-ha! | joyful laugh |
| `red_fest_2.wav` | Oom-ba! Oom-ba! | drum-like chant |
| `red_chatter_2.wav` | Ho-mo, doru! | chatty |
| `red_chatter_4.wav` | Daka-ree, hm? | curious question |

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
