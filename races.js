/* =====================================================================
   THE RUNNERS PLAYGROUND — RACE LIST
   ---------------------------------------------------------------------
   This is the only file you need to edit to add a new race.
   Copy one race block { ... }, paste it at the top of the list,
   and change the details. Every race gets the same dashboard.

   HOW TO FILL IN A RACE
   id          short code used in the web address, no spaces (e.g. "westvaal")
   name        full race name
   date        "YYYY-MM-DD"
   venue       where it starts / finishes
   coords      [latitude, longitude] of the start, for the weather forecast
   leaderboard url of your Google Apps Script (see SETUP.txt). "" = no leaderboard yet
   logReminder time of day runners get reminded to log their actual time
   distances   one block per distance:
     key        short code ("10k")
     label      what runners see ("10 km")
     km         official distance
     watchKm    (optional) what most GPS watches show, e.g. 5.0 for a 4.9 km route
     start      gun time "06:30"
     goal       default goal time "0:55:00"
     goals      one-tap goal buttons
     profile    the course: [km, metres above sea level] points.
                Route requests arrive in your Google Drive with the GPX file;
                ask Claude to turn a GPX into this profile line.
     estimated  true if the profile is a guess (shows a warning)
     landmarks  [{ km: 5, label: "Turnaround" }]
     turnaround km of an out-and-back turn (optional)
     segments   (optional) one entry per km: title, surface, cue, rpe
   ===================================================================== */

window.LEADERBOARD_URL = ""; // paste your new Google Apps Script web app URL here (see SETUP.txt)

window.RACES = [
  {
    id: "westvaal",
    name: "Westvaal VW 10km Race",
    date: "2026-12-05",
    venue: "R40 in front of Westvaal VW, Riverside, Mbombela",
    coords: [-25.436062, 30.970734],
    entryUrl: "https://www.entryninja.com/events/84202-westvaal-vw",
    leaderboard: { url: "USE_DEFAULT" },
    logReminder: "11:00",
    distances: [
      {
        key: "10k", label: "10 km", km: 10, start: "06:30", goal: "0:55:00",
        goals: ["0:45:00", "0:50:00", "0:55:00", "1:00:00", "1:10:00"],
        estimated: true,
        profile: [[0, 670], [10, 670]],
        landmarks: [
          { km: 0, label: "Start · Westvaal VW on the R40" },
          { km: 3.5, label: "City centre loop (past SAPS & China Town)" },
          { km: 7, label: "Makro Mbombela · Riverside" },
          { km: 8.1, label: "Curro Academy roundabout, back to the R40" },
          { km: 10, label: "Finish · Riverside Boulevard circle" }
        ]
      },
      {
        key: "5k", label: "4.9 km", km: 4.9, watchKm: 5.0, start: "06:45", goal: "0:28:00",
        goals: ["0:22:00", "0:25:00", "0:28:00", "0:32:00", "0:38:00"],
        estimated: true,
        profile: [[0, 670], [4.9, 670]],
        landmarks: [
          { km: 0, label: "Start · Westvaal VW on the R40" },
          { km: 1.8, label: "Silver Oak Street turn" },
          { km: 2.8, label: "Flamboyant Street loop" },
          { km: 4.9, label: "Finish · Riverside Boulevard circle" }
        ]
      }
    ]
  },

  {
    id: "mataffin",
    name: "Mataffin Home Run",
    date: "2026-11-21",
    venue: "Mbombela Stadium ↔ Halls Farm ↔ Crocodile River",
    coords: [-25.4614, 30.9293],
    leaderboard: { url: "https://script.google.com/macros/s/AKfycbyUzAtTiV3K5sPWOvgjpf-YuaqE90vTsRnl5o3fhApz1pnheQvKkvDULyZfOXwzvEul/exec", legacy: true },
    logReminder: "13:00",
    distances: [
      {
        key: "10k", label: "10 km", km: 10, start: "06:30", goal: "1:00:00",
        goals: ["0:45:00", "0:50:00", "0:55:00", "1:00:00", "1:10:00"],
        profile: [[0, 660], [1, 663], [2, 669], [3, 654], [4, 632], [5, 620], [6, 632], [7, 654], [8, 669], [9, 663], [10, 660]],
        turnaround: 5,
        landmarks: [{ km: 0, label: "Mbombela Stadium" }, { km: 5, label: "Crocodile River turnaround" }, { km: 10, label: "Stadium finish" }],
        segments: [
          { title: "Stadium Exit to Mataffin Tarmac", surface: "tar", rpe: 6, cue: "Settle into rhythm leaving Mbombela Stadium; don't get pulled out too fast." },
          { title: "Entering Halls Farm & Upper Orchards", surface: "mixed", rpe: 6.5, cue: "Shorten stride slightly on the initial rise onto the farm road." },
          { title: "Winding into the Litchi Groves", surface: "dirt", rpe: 6.5, cue: "Shaded litchi canopy! Let gravity help while watching footing on compact dirt." },
          { title: "Dropping Toward Crocodile River", surface: "dirt", rpe: 7, cue: "Fastest downhill drop. Relax your shoulders: bank rhythm, not extra effort." },
          { title: "River Bank & 5 km Turnaround", surface: "dirt", rpe: 7, cue: "Pass along the river, grab water, and pivot cleanly at the turnaround." },
          { title: "Leaving River Back into Groves", surface: "dirt", rpe: 7.5, cue: "Return climb begins. Keep perceived effort steady as the watch eases." },
          { title: "Mid-Orchard Climb through Litchi Trees", surface: "dirt", rpe: 8, cue: "Toughest km on course. Drive elbows back; humidity sits heavier under trees." },
          { title: "Climbing Out of Halls Farm", surface: "mixed", rpe: 8, cue: "Crest the main orchard climb and transition back onto firmer tarmac." },
          { title: "Stadium Approach Road", surface: "tar", rpe: 8.5, cue: "Use the firmer tarmac snap to pick up leg turnover toward the stadium." },
          { title: "Final Push into Mbombela Stadium", surface: "tar", rpe: 9.5, cue: "Spot the stadium columns and empty the tank to the finish arch!" }
        ]
      },
      {
        key: "5k", label: "4.9 km", km: 4.9, watchKm: 5.0, start: "06:40", goal: "0:30:00",
        goals: ["0:22:00", "0:25:00", "0:28:00", "0:32:00", "0:38:00"],
        profile: [[0, 660], [1, 664], [2, 648], [3, 646], [4, 664], [4.9, 660]],
        turnaround: 2.45,
        landmarks: [{ km: 0, label: "Mbombela Stadium" }, { km: 2.45, label: "Turnaround" }, { km: 4.9, label: "Stadium finish" }],
        segments: [
          { title: "Stadium Exit toward Farm Gate", surface: "tar", rpe: 7, cue: "Controlled start from the 06:40 gun; find clear air early." },
          { title: "Entering Halls Farm & Litchi Edge", surface: "dirt", rpe: 7.5, cue: "Open up your stride as the farm track dips gently into the trees." },
          { title: "Turnaround & Initial Return Climb", surface: "dirt", rpe: 8, cue: "Pivot cleanly at the turnaround cone and lean slightly into the incline." },
          { title: "Climbing Out of Halls Farm to Tar", surface: "mixed", rpe: 8.5, cue: "Hold strong form on the uphill orchard drag back to the main road." },
          { title: "Final Sprint to Stadium Finish", surface: "tar", rpe: 9.5, cue: "Back on fast tarmac: kick hard all the way to the stadium finish!" }
        ]
      }
    ]
  },

  {
    id: "kaapsehoop",
    name: "Kaapsehoop 4 in 1 Marathon",
    date: "2026-11-07",
    venue: "Kaapsehoop escarpment → Mbombela Stadium",
    coords: [-25.5880, 30.7670],
    leaderboard: { url: "" },
    logReminder: "13:00",
    distances: [
      {
        key: "half", label: "21.1 km", km: 21.1, start: null, goal: "1:44:59",
        goals: ["1:29:59", "1:44:59", "1:59:59", "2:14:59"],
        profile: [[0, 1260], [1.5, 1210], [3.5, 1110], [6.0, 965], [8.0, 885], [9.2, 912], [11.5, 815], [13.5, 745], [15.5, 712], [17.8, 698], [18.9, 678], [19.8, 706], [21.1, 675]],
        landmarks: [{ km: 0.2, label: "Kaapsehoop start" }, { km: 4.5, label: "Berlin drop" }, { km: 9.2, label: "Pass roller" }, { km: 13.5, label: "Valley floor" }, { km: 17.8, label: "Mataffin rollers" }, { km: 19.8, label: "Mbombela sting" }, { km: 21.1, label: "Stadium" }]
      },
      {
        key: "full", label: "42.2 km", km: 42.2, start: null, goal: "3:39:59",
        goals: ["2:59:59", "3:29:59", "3:59:59", "4:29:59"],
        profile: [[0, 1640], [3.0, 1590], [6.0, 1625], [10.0, 1490], [15.0, 1360], [21.1, 1260], [25.0, 1060], [29.0, 885], [31.0, 912], [35.0, 745], [39.0, 695], [40.8, 715], [42.2, 675]],
        landmarks: [{ km: 0.5, label: "High plateau start" }, { km: 21.1, label: "Half marathon merge" }, { km: 26, label: "Berlin drop" }, { km: 40.8, label: "Stadium overpass sting" }, { km: 42.2, label: "Mbombela Stadium" }]
      },
      {
        key: "10k", label: "10 km", km: 10, start: null, goal: "0:47:30",
        goals: ["0:39:59", "0:44:59", "0:49:59", "0:54:59"],
        profile: [[0, 940], [2.0, 865], [4.0, 785], [6.0, 725], [7.8, 690], [8.8, 712], [10.0, 675]],
        landmarks: [{ km: 0.2, label: "Escarpment start" }, { km: 3.5, label: "Valley drop" }, { km: 8.8, label: "Overpass sting" }, { km: 10, label: "Mbombela Stadium" }]
      }
    ]
  }
];
