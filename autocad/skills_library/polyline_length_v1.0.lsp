;;; ==========================================================================
;;; AutoLISP Skill: Подсчет суммарной длины полилиний (ID Vault)
;;; ==========================================================================
1
(defun c:ID_PolylineLength ( / ss i totalLen ent obj len)
  (vl-load-com)
  (princ "\nВыберите полилинии и линии для подсчета суммарной длины: ")
  (setq ss (ssget '((0 . "LINE,LWPOLYLINE,POLYLINE,ARC,SPLINE"))))
  (if ss
    (progn
      (setq totalLen 0.0)
      (setq i 0)
      (repeat (sslength ss)
        (setq ent (ssname ss i))
        (setq obj (vlax-ename->vla-object ent))
        (setq len (vlax-curve-getdistatparam obj (vlax-curve-getendparam obj)))
        (setq totalLen (+ totalLen len))
        (setq i (1+ i))
      )
      (alert (strcat "Результат подсчета ID Vault:\n\nВыбрано объектов: " (itoa (sslength ss)) 
                     "\nСуммарная длина: " (rtos totalLen 2 2) " мм (" (rtos (/ totalLen 1000.0) 2 3) " м)"))
      (princ (strcat "\n[ID Vault] Суммарная длина: " (rtos totalLen 2 2) " мм"))
    )
    (princ "\nОбъекты не выбраны.")
  )
  (princ)
)

(princ "\nСкилл 'ID_PolylineLength' загружен. Запустите командой ID_PolylineLength.")
(princ)
