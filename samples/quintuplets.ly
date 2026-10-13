\version "2.24.0"
\header { tagline = ##f }
#(define std-drums '((bassdrum () #f -3) (snare () #f 1) (hihat cross #f 5)))
\paper { indent = 0 line-width = 150\mm }
\score {
  \new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) } \drummode {
    \stemUp
    \tuplet 5/4 { sn16 sn sn sn sn } \tuplet 5/4 { sn16 sn sn sn sn } \tuplet 5/4 { sn16 sn sn sn sn } \tuplet 5/4 { sn16 sn sn sn sn } |
    \tuplet 5/4 { hh16 hh hh hh hh } sn16 sn sn sn \tuplet 5/4 { bd16 sn sn bd sn } hh4 |
    hh8 hh sn16 sn sn sn \tuplet 5/4 { sn16 sn sn sn sn } bd4 |
  }
  \layout { }
}
