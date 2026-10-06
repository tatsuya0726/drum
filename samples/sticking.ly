\version "2.24.0"
\header { tagline = ##f }
#(define std-drums '((bassdrum () #f -3) (snare () #f 1) (hihat cross #f 5) (hightom () #f 3)))
\paper { indent = 0 line-width = 150\mm }
\score {
  \new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) } \drummode {
    \stemUp \textLengthOff
    sn16_"R" sn_"L" sn_"R" sn_"R" sn_"L" sn_"R" sn_"L" sn_"L" sn8_"R" sn_"L" sn16_"R" sn_"L" sn_"L" sn_"R" |
    sn16_"R" sn_"L" sn_"R" sn_"L" tomh_"R" tomh_"R" sn_"L" sn_"L" <sn bd>8_"R" sn_"L" sn4_"R" |
  }
  \layout { }
}
