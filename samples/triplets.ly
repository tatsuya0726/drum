\version "2.24.0"
\header { tagline = ##f }
#(define std-drums '((bassdrum () #f -3) (snare () #f 1) (hihat cross #f 5)))
\paper { indent = 0 line-width = 150\mm }
\score {
  \new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) } \drummode {
    \stemUp
    \tuplet 3/2 { hh8 hh hh } \tuplet 3/2 { sn8 hh hh } \tuplet 3/2 { hh8 hh bd } \tuplet 3/2 { sn8 hh hh } |
    hh8 hh sn16 sn sn sn \tuplet 3/2 { bd8 bd bd } sn4 |
    \tuplet 3/2 { sn16 sn sn } \tuplet 3/2 { sn16 sn sn } hh8 hh \tuplet 3/2 { sn8 sn sn } \tuplet 3/2 { bd16 bd bd } \tuplet 3/2 { sn16 sn sn } |
    sn8 sn sn sn hh16 hh hh hh hh4 |
  }
  \layout { }
}
