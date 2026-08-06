;;; ==========================================================================
;;; AutoLISP Skill: Подсчет блоков и элементов спецификации (ID Vault)
;;; ==========================================================================

(defun c:ID_BlockCount ( / ss i ent name countDict resStr)
  (vl-load-com)
  (princ "\nВыберите блоки для подсчета спецификации: ")
  (setq ss (ssget '((0 . "INSERT"))))
  (if ss
    (progn
      (setq countDict '())
      (setq i 0)
      (repeat (sslength ss)
        (setq ent (ssname ss i))
        (setq name (cdr (assoc 2 (entget ent))))
        (if (assoc name countDict)
          (setq countDict (subst (cons name (1+ (cdr (assoc name countDict)))) (assoc name countDict) countDict))
          (setq countDict (cons (cons name 1) countDict))
        )
        (setq i (1+ i))
      )
      (setq resStr "Спецификация блоков (ID Vault):\n\n")
      (foreach item countDict
        (setq resStr (strcat resStr (car item) ": " (itoa (cdr item)) " шт.\n"))
      )
      (alert resStr)
      (princ (strcat "\n[ID Vault] " resStr))
    )
    (princ "\nБлоки не выбраны.")
  )
  (princ)
)

(princ "\nСкилл 'ID_BlockCount' загружен. Запустите командой ID_BlockCount.")
(princ)
