;;; ==========================================================================
;;; AutoLISP Skill: Автоматическая простановка высотных отметок (ID Vault)213 а
;;; ==========================================================================

(defun c:ID_ElevationMark ( / p basePt baseElev scaleFactor userPt deltaY elevVal textStr)
  (vl-load-com)
  (setq basePt (getpoint "\nУкажите базовую точку (0.000): "))
  (if basePt
    (progn
      (setq baseElev (getreal "\nВведите базовую отметку <0.000>: "))
      (if (null baseElev) (setq baseElev 0.0))
      (setq scaleFactor (getreal "\nМасштаб выноски <1.0>: "))
      (if (null scaleFactor) (setq scaleFactor 1.0))
      
      (while (setq userPt (getpoint basePt "\nУкажите точку выноски отметки (ESC для выхода): "))
        (setq deltaY (- (cadr userPt) (cadr basePt)))
        (setq elevVal (+ baseElev (/ deltaY 1000.0))) ; при мм в чертеже
        (if (>= elevVal 0.0)
          (setq textStr (strcat "+" (rtos elevVal 2 3)))
          (setq textStr (rtos elevVal 2 3))
        )
        (command "._TEXT" userPt (* 250.0 scaleFactor) 0 textStr)
        (princ (strcat "\nОтметка проставлена: " textStr))
      )
    )
  )
  (princ)
)

(princ "\nСкилл 'ID_ElevationMark' загружен. Запустите командой ID_ElevationMark.")
(princ)
