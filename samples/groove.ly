\version "2.24.0"
\header { title = "Sample Groove" tagline = ##f }
\paper { #(set-paper-size "a4") }
% 一般的なドラム譜の配置 (HH=G5, Ride=F5, Crash=A5, Pedal HH=D4)
#(define std-drums '(
  (bassdrum () #f -3) (snare () #f 1) (sidestick cross #f 1)
  (hihat cross #f 5) (openhihat cross open 5) (pedalhihat cross #f -5)
  (ridecymbal cross #f 4) (crashcymbal cross #f 6)
  (hightom () #f 3) (himidtom () #f 2) (highfloortom () #f -1)))
up = \drummode {
  \repeat unfold 2 { hh8 hh hh hh hh hh hh hh | }
  hh8 hh hh hh hh hh hh hh | cymc4 hh8 hh hh hh hh hh |
  \repeat unfold 2 { hh16 hh hh hh hh hh hh hh hh hh hh hh hh hh hh hh | }
  cymr4 cymr cymr cymr | cymc4 cymr8 cymr cymr cymr cymr cymr |
}
down = \drummode {
  bd4 sn bd sn | bd8 bd sn4 bd sn |
  bd4 sn bd8 bd sn4 | bd4 sn bd sn |
  bd4 sn8 bd bd bd sn4 | bd4 sn tomh8 tommh tomfh tomfh |
  bd4 sn bd sn8 bd | bd4 sn bd sn |
}
\new DrumStaff \with { drumStyleTable = #(alist->hash-table std-drums) } <<
  \tempo 4 = 100
  \new DrumVoice { \voiceOne \up }
  \new DrumVoice { \voiceTwo \down }
>>
