\version "2.24.0"
#(define std-drums '((bassdrum () #f -3) (snare () #f 1) (hihat cross #f 5)))
\paper { indent = 0 line-width = 95\mm oddFooterMarkup = ##f oddHeaderMarkup = ##f bookTitleMarkup = ##f scoreTitleMarkup = ##f }
\header { tagline = ##f }
\score { \new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) \remove "Time_signature_engraver" } \drummode { \stemUp \bar ".|:" <hh bd>8 <hh>8  <hh bd sn>8 <hh>8  <hh bd>8 <hh>8  <hh bd sn>8 <hh>8  \bar ":|." } \layout { } }
