\version "2.24.0"
\header { title = "Funk Exercise" tagline = ##f }
\paper { #(set-paper-size "a4") }
#(define std-drums '(
  (bassdrum () #f -3) (snare () #f 1) (sidestick cross #f 1)
  (hihat cross #f 5) (openhihat cross open 5) (pedalhihat cross #f -5)
  (ridecymbal cross #f 4) (crashcymbal cross #f 6)
  (hightom () #f 3) (himidtom () #f 2) (highfloortom () #f -1)))
up = \drummode {
  hh16 hh hh hh hh hh hh hh hh hh hh hh hh hh hh hh |
  hh8 hh hh hh hh hh hh hh |
  hh8 hh hh hh hh hh hh hh |
  sn16 sn sn sn tomh tomh tomh tomh tommh tommh tommh tommh tomfh tomfh tomfh tomfh |
  cymc4 hh8 hh hh hh hh hh |
  hh8 hh hh hh hh hh hh hh |
  r8 hh hh hh r hh hh hh |
  hh8 hh hh hh hh hh hh hh |
  cymr8 cymr cymr cymr cymr cymr cymr cymr |
  cymr8 cymr cymr cymr cymr cymr cymr cymr |
  sn8 sn16 sn sn8 sn tomh tomh tomfh tomfh |
  cymc1 |
}
down = \drummode {
  bd8. bd16 sn8 r16 bd r bd bd8 sn4 |
  bd4 sn8. bd16 r8 bd sn4 |
  bd16 bd r8 sn4 r8 bd16 bd sn4 |
  s1 |
  bd4 sn bd sn |
  bd8 r r bd r bd r4 |
  bd4 sn bd sn |
  bd4. bd8 sn4 r16 bd8. |
  bd4 sn bd sn |
  bd8 bd sn4 r8 bd sn4 |
  bd4 s4 bd4 s4 |
  bd1 |
}
\new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) } <<
  \tempo 4 = 92
  \new DrumVoice { \voiceOne \up }
  \new DrumVoice { \voiceTwo \down }
>>
