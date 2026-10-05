\version "2.24.0"
\header { tagline = ##f }
#(define std-drums '((bassdrum () #f -3) (snare () #f 1) (hihat cross #f 5)))
\paper { indent = 0 line-width = 120\mm }
\score {
  \new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) } \drummode {
    \stemUp
    hh16 hh32 hh32 hh8 sn32 sn32 sn16 sn8 bd16 bd16 bd32 bd32 bd16 hh4 |
    hh8 hh16 hh16 sn32 sn32 sn32 sn32 sn8 bd8. bd16 hh32 hh32 hh16 hh8 |
  }
  \layout { }
}
