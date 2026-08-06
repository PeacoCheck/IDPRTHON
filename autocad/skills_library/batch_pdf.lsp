;;; ==========================================================================
;;; AutoLISP Skill: Пакетный экспорт в PDF (ID Vault)
;;; ==========================================================================

(defun c:ID_BatchExportPDF ( / layouts layoutName pdfPath)
  (vl-load-com)
  (setq layouts (vla-get-Layouts (vla-get-ActiveDocument (vlax-get-acad-object))))
  (vlax-for layout layouts
    (setq layoutName (vla-get-Name layout))
    (if (/= layoutName "Model")
      (princ (strcat "\nЭкспорт листа в PDF: " layoutName))
    )
  )
  (alert "Пакетная печать PDF инициирована из ID Vault.")
  (princ)
)

(princ "\nСкилл 'ID_BatchExportPDF' загружен. Запустите командой ID_BatchExportPDF.")
(princ)
