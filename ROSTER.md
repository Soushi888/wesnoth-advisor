# Roster

Who is serving and who is not. **This file is a snapshot, not the source of truth.** Regenerate it with:

```bash
bun run roster
```

The command reconstructs everything by diffing consecutive scenario-start savegames, so it stays correct without anyone maintaining it by hand. A later session should run it rather than trust the numbers below.

One blind spot to know about: a unit recruited and killed inside the same scenario appears in neither snapshot, so it is invisible to the count. The real death toll is at least what is listed here. For the same reason, "since" is the first scenario a unit was seen at the *start* of, so a unit recruited mid-scenario shows the following scenario.

Items listed against a fallen unit went down with them. There is no event that returns a dead friendly unit's equipment to the bag.

---

```
run       2026-08-23 to 2026-08-24
```
run       2026-08-23 to 2026-08-24
scenarios An Orcish Assault -> The Assassination -> Banished -> Paradise Lost -> Shatter the Defilers
standing  22 alive, 17 lost

serving (22), best first
  L3 Efraim de Ceise    09 Fencer             97/100 xp  since An Orcish Assault           [Potion of Steel Skin, Leather Armour, Sword of Krux, Rherraent's Helm]
  L3 Delenia            Delly_start           20/136 xp  since An Orcish Assault    loyal  [Twinkling Sword, Virtual Void, The Doctrine of Vindictiveness, Exterminator's Knives]
  L2 Yddin              Bandit                44/61  xp  since Paradise Lost             
  L2 Huwyn              Rogue                 37/80  xp  since The Assassination           [Poison, Rherraent's Helm]
  L2 Arcer              Rogue                 27/100 xp  since Shatter the Defilers      
  L2 Caeraeka           Rogue                 21/80  xp  since The Assassination         
  L2 Teowell            Rogue                 19/80  xp  since Paradise Lost             
  L2 Giraryn            Bandit                12/61  xp  since Paradise Lost             
  L2 Rutharry           Rogue                  3/80  xp  since Shatter the Defilers      
  L2 Deoran             Longbowman             1/81  xp  since The Assassination         
  L2 Cleraeka           Rogue                  0/80  xp  since Shatter the Defilers      
  L1 Aeraery            Poacher               24/35  xp  since Paradise Lost             
  L1 Eryn               Poacher               23/35  xp  since Shatter the Defilers      
  L1 Hallaent           Spearman              21/53  xp  since The Assassination         
  L1 Derrreoryr         Footpad                3/35  xp  since Paradise Lost             
  L1 Vobogyc            Thug                   2/32  xp  since Shatter the Defilers      
  L1 Conyr              Thug                   2/32  xp  since Shatter the Defilers      
  L1 Inyc               Footpad                0/35  xp  since Paradise Lost             
  L1 Marilyan           Footpad                0/35  xp  since Shatter the Defilers      
  L1 Blaeraryn          Poacher                0/28  xp  since Shatter the Defilers      
  L1 Dogwyryn           Poacher                0/35  xp  since Shatter the Defilers      
  L0 Mario              Peasant_Mario         43/72  xp  since The Assassination    loyal

fallen (17)
  L1 Rerungyan          Thief                 lost in The Assassination
  L1 Gaeran             Thief                 lost in The Assassination
  L1 Addreorer          Thief                 lost in Banished
  L1 Yrreddyn           Footpad               lost in Banished
  L1 Leoraeran          Thief                 lost in Banished
  L2 Ynoc               Rogue                 lost in Banished
  L1 Aeraent            Fencer                lost in Banished
  L1 Meotharryn         Fencer                lost in Banished
  L1 Aran               Heavy Infantryman     lost in Banished
  L1 Syry               Fencer                lost in Banished
  L1 Evan               Bowman                lost in Banished
  L1 Sythyr             Thug                  lost in Paradise Lost
  L2 Ylla               Rogue                 lost in Paradise Lost
  L1 Saenawyn           Thief                 lost in Paradise Lost
  L1 Meoralyn           Poacher               lost in Paradise Lost
  L1 Raercaent          Thug                  lost in Paradise Lost
  L1 Raella             Thief                 lost in Paradise Lost

losses per scenario
  An Orcish Assault        0
  The Assassination        2
  Banished                 9
  Paradise Lost            6
  Shatter the Defilers     0

Reconstructed by diffing consecutive scenario-start saves, so a unit recruited
and killed inside one scenario never appears here. Items listed against a fallen
unit went down with them and are gone.
```
