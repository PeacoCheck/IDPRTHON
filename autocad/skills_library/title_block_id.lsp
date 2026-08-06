;;; ==========================================================================
;;; AutoLISP Skill: Вставка штампа Исполнительной Документации (ID Vault)
;;; ==========================================================================

(defun c:ID_TitleBlockID ( / pt textObj)
  (vl-load-com)
  (setq pt (getpoint "\nУкажите угол вставки штампа ИД: "))
  (if pt
    (progn
      (command "._RECTANG" pt (list (+ (car pt) 185.0) (+ (cadr pt) 55.0)))
      (command "._LINE" (list (car pt) (+ (cadr pt) 15.0)) (list (+ (car pt) 185.0) (+ (cadr pt) 15.0)) "")
      (command "._TEXT" (list (+ (car pt) 5.0) (+ (cadr pt) 20.0)) 3.5 0 "ИСПРАВЛЕНИЯМ И ОТКЛОНЕНИЯМ СООТВЕТСТВУЕТ")
      (command "._TEXT" (list (+ (car pt) 5.0) (+ (cadr pt) 5.0)) 3.0 0 "Исполнительная документация ID Vault")
      (alert "Штамп ИД успешно вставлен в чертёж!")
    )
  )
  (princ)
)

(princ "\nСкилл 'ID_TitleBlockID' загружен. Запустите командой ID_TitleBlockID.")
(princ)
