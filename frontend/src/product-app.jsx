import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileArchive,
  FilePlus2,
  FileText,
  History,
  LayoutDashboard,
  MonitorCog,
  MoreHorizontal,
  Plus,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "./api.js";
import { Button } from "./components/ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.jsx";
import { Input } from "./components/ui/input.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table.jsx";
import {
  autoAnimateOptions,
  hoverTransition,
  pageMotion,
} from "./lib/motion.js";

const routes = [
  { key: "home", label: "Главная", icon: LayoutDashboard },
  { key: "objects", label: "Объекты", icon: Building2 },
  { key: "templates", label: "Шаблоны", icon: FileText },
  { key: "reports", label: "Комплектность", icon: CheckCircle2 },
  { key: "autocad", label: "AutoCAD", icon: MonitorCog },
];

function routeFromHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "editor" && Number(parts[1]))
    return { key: "editor", documentId: Number(parts[1]) };
  if (parts[0] === "objects" && Number(parts[1]))
    return { key: "object", objectId: Number(parts[1]) };
  if (parts[0] === "objects") return { key: "objects" };
  if (parts[0] === "templates") return { key: "templates" };
  if (parts[0] === "autocad") return { key: "autocad" };
  if (parts[0] === "reports") return { key: "reports" };
  return { key: "home" };
}

function navigate(route) {
  location.hash = route;
}

function count(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}
function objectTitle(object) {
  return object?.short_name || object?.name || "Объект без названия";
}
function score(object) {
  return Math.max(0, Math.min(100, Number(object?.integrity) || 0));
}
function groupLabel(group) {
  return group?.title || group?.name || group?.code || "Без названия";
}
function GroupMarker({ group, compact = false }) {
  const Icon = {
    registry: FileText,
    working: FilePlus2,
    permits: CheckCircle2,
    journals: History,
    acts: FileArchive,
    schemes: MonitorCog,
    quality: CircleAlert,
    source: LayoutDashboard,
    evidence: Search,
    archive: FileArchive,
    other: MoreHorizontal,
  }[group?.kind || group?.code] || FileText;
  return <span className={`product-group-marker ${compact ? "is-compact" : ""}`} title={groupLabel(group)}>
    <Icon size={14} aria-hidden="true" />
    {!compact && <span>{groupLabel(group)}</span>}
  </span>;
}

function useRoute() {
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  return route;
}

function ProductShell({ route, objects, children, onNewObject, onSelectCurrent }) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [selectingObject, setSelectingObject] = useState(false);
  const currentObject = objects.find((item) => item.is_current) || objects[0];
  return (
    <div className="product-shell">
      <aside className="product-rail">
        <a
          className="product-brand"
          href="#/home"
          aria-label="ID Vault — главная"
        >
          ID
        </a>
        <nav className="product-nav" aria-label="Основная навигация">
          {routes.map(({ key, label, icon: Icon }) => (
            <a
              key={key}
              href={`#/${key === "reports" ? "reports/completeness" : key}`}
              className={`product-nav__item ${route.key === key || (key === "objects" && route.key === "object") ? "is-active" : ""}`}
              title={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="product-rail__footer">
          <Dialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
            <DialogTrigger asChild>
              <Button
                className="product-rail__diagnostics"
                variant="ghost"
                size="sm"
                aria-label="Диагностика AutoCAD"
              >
                <Activity size={15} /> Диагностика
              </Button>
            </DialogTrigger>
            {diagnosticsOpen && <DiagnosticsDialog />}
          </Dialog>
          <span className="product-rail__archive"><span className="product-live-dot" /> Локальный архив</span>
        </div>
      </aside>
      <main className="product-main">
        <header className="product-topbar">
          <div className="product-search">
            <Search size={16} />
            <span>Поиск документов и объектов</span>
            <kbd>Ctrl K</kbd>
          </div>
          <select
            className="product-current-object"
            aria-label="Текущий объект"
            value={currentObject?.id || ""}
            disabled={selectingObject || !objects.length}
            onChange={async (event) => {
              const id = Number(event.target.value);
              if (!id || id === Number(currentObject?.id)) return;
              setSelectingObject(true);
              try {
                await api.selectObject(id);
                await onSelectCurrent();
              } finally {
                setSelectingObject(false);
              }
            }}
          >
            {objects.map((item) => <option key={item.id} value={item.id}>{item.code || "—"} · {objectTitle(item)}</option>)}
          </select>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" onClick={onNewObject}>
                <Plus size={16} /> Новый объект
              </Button>
            </DialogTrigger>
            <NewObjectDialog />
          </Dialog>
        </header>
        <AnimatePresence mode="wait">
          {cloneElement(children, {
            key: `${route.key}-${route.objectId || route.documentId || "root"}`,
          })}
        </AnimatePresence>
      </main>
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone = "blue" }) {
  return (
    <motion.article layout className={`product-stat product-stat--${tone}`}>
      <div className="product-stat__icon">
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </motion.article>
  );
}

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="product-page-header">
      <div>
        <span className="product-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="product-page-header__actions">{actions}</div>}
    </header>
  );
}

function Skeleton({ rows = 3 }) {
  return (
    <div className="product-skeleton" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function Dashboard({ objects, loading }) {
  const active = objects.filter((object) => object.status !== "archived");
  const documents = objects.reduce(
    (sum, object) => sum + (Number(object.documents_count) || 0),
    0,
  );
  const files = objects.reduce(
    (sum, object) =>
      sum + (Number(object.present_files ?? object.present_count) || 0),
    0,
  );
  const average = active.length
    ? Math.round(
        active.reduce((sum, object) => sum + score(object), 0) / active.length,
      )
    : 0;
  return (
    <motion.section {...pageMotion} className="product-page">
      <PageHeader
        eyebrow="Рабочее пространство"
        title="ID Vault"
        description=""
        actions={
          <Button asChild variant="outline">
            <a href="#/objects">
              Открыть реестр <ChevronRight size={16} />
            </a>
          </Button>
        }
      />
      {loading ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="product-stat-grid">
            <StatCard
              label="Активные объекты"
              value={count(active.length)}
              detail="в текущей работе"
              icon={Building2}
            />
            <StatCard
              label="Документы"
              value={count(documents)}
              detail="в реестрах объектов"
              icon={FileText}
              tone="violet"
            />
            <StatCard
              label="Файлы в архиве"
              value={count(files)}
              detail="с локальными версиями"
              icon={FileArchive}
              tone="green"
            />
            <StatCard
              label="Средняя комплектность"
              value={`${average}%`}
              detail="по активным объектам"
              icon={CheckCircle2}
              tone="amber"
            />
          </div>
          <section className="product-panel product-panel--objects">
            <div className="product-panel__header">
              <div>
                <h2>Недавние объекты</h2>
              </div>
              <Button asChild variant="ghost" size="sm">
                <a href="#/objects">
                  Все объекты <ChevronRight size={15} />
                </a>
              </Button>
            </div>
            <div className="product-card-grid">
              {active.slice(0, 6).map((object) => (
                <ObjectCard key={object.id} object={object} />
              ))}
            </div>
          </section>
        </>
      )}
    </motion.section>
  );
}

function ObjectCard({ object }) {
  return (
    <motion.a
      layout
      href={`#/objects/${object.id}`}
      className="product-object-card"
      whileHover={{ y: -2 }}
      transition={hoverTransition}
    >
      <div className="product-object-card__head">
        <span className="product-code">{object.code || "БЕЗ КОДА"}</span>
        <ChevronRight size={16} />
      </div>
      <strong>{objectTitle(object)}</strong>
      <p>{object.address || "Адрес не указан"}</p>
      <div className="product-progress">
        <span style={{ width: `${score(object)}%` }} />
      </div>
      <footer>
        <span>{count(object.documents_count)} документов</span>
        <b>{score(object)}%</b>
      </footer>
    </motion.a>
  );
}

function ObjectList({ objects, loading }) {
  const [query, setQuery] = useState("");
  const [listRef] = useAutoAnimate(autoAnimateOptions);
  const filtered = useMemo(
    () =>
      objects.filter((object) =>
        `${objectTitle(object)} ${object.code || ""} ${object.address || ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(query.toLocaleLowerCase("ru-RU")),
      ),
    [objects, query],
  );
  return (
    <motion.section {...pageMotion} className="product-page">
      <PageHeader
        eyebrow="Архив"
        title="Объекты"
        description=""
        actions={
          <Input
            className="product-list-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти объект"
            aria-label="Найти объект"
          />
        }
      />
      <section className="product-panel">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Объект</TableHeader>
              <TableHeader>Документы</TableHeader>
              <TableHeader>Файлы</TableHeader>
              <TableHeader>Комплектность</TableHeader>
              <TableHeader>
                <span className="sr-only">Действия</span>
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody ref={listRef}>
            {loading ? (
              <TableRow>
                <TableCell colSpan="5">
                  <Skeleton rows={3} />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((object) => (
                <TableRow
                  key={object.id}
                  onClick={() => navigate(`#/objects/${object.id}`)}
                  tabIndex="0"
                >
                  <TableCell>
                    <div className="product-object-cell">
                      <span className="product-code">{object.code || "—"}</span>
                      <strong>{objectTitle(object)}</strong>
                      <small>{object.address || "Адрес не указан"}</small>
                    </div>
                  </TableCell>
                  <TableCell data-label="Документы">
                    {count(object.documents_count)}
                  </TableCell>
                  <TableCell data-label="Файлы">
                    {count(object.present_files ?? object.present_count)}
                  </TableCell>
                  <TableCell data-label="Комплектность">
                    <div className="product-score">
                      <span>
                        <i style={{ width: `${score(object)}%` }} />
                      </span>
                      <b>{score(object)}%</b>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ChevronRight size={16} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </motion.section>
  );
}

function ObjectWorkspace({ objectId, onRefresh }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [groupId, setGroupId] = useState("all");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkspace(await api.workspace(objectId));
    } finally {
      setLoading(false);
    }
  }, [objectId]);
  useEffect(() => {
    load();
  }, [load]);
  const groups = workspace?.groups || [];
  const documents = workspace?.documents || [];
  const workspaceScore = Number(
    workspace?.integrity?.score ?? workspace?.integrity ?? 0,
  );
  const selected = documents.filter((document) => {
    const hasFile = Boolean(document.has_file || document.source_file);
    const inSelectedGroup = groupId === "all" || String(document.group_id) === String(groupId);
    const matchesQuery = `${document.title || ""} ${document.number || ""}`
      .toLocaleLowerCase("ru-RU")
      .includes(query.toLocaleLowerCase("ru-RU"));
    const matchesFilter = documentFilter === "all"
      || (documentFilter === "attention" && (!hasFile || ["needs_revision", "in_progress", "not_started"].includes(document.completion_status || "not_started")))
      || (documentFilter === "files" && !hasFile)
      || (documentFilter === "completed" && document.completion_status === "completed");
    return inSelectedGroup && matchesQuery && matchesFilter;
  });
  const [listRef] = useAutoAnimate(autoAnimateOptions);
  return (
    <motion.section {...pageMotion} className="product-page">
      {loading ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <a href="#/objects" className="product-back">
            <ArrowLeft size={15} /> Все объекты
          </a>
          <PageHeader
            eyebrow={workspace?.object?.code || "ОБЪЕКТ"}
            title={objectTitle(workspace?.object)}
            description={
              workspace?.object?.address || "Реестр исполнительной документации"
            }
            actions={
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Upload size={16} /> Добавить файлы
                  </Button>
                </DialogTrigger>
                <ImportDialog
                  objectId={objectId}
                  groups={groups}
                  onComplete={async () => {
                    await load();
                    await onRefresh();
                  }}
                />
              </Dialog>
            }
          />
          <div className="product-workspace-meta">
            <div>
              <span>Документы</span>
              <strong>{count(documents.length)}</strong>
            </div>
            <div>
              <span>Группы</span>
              <strong>{count(groups.length)}</strong>
            </div>
            <div>
              <span>Комплектность</span>
              <strong>{score({ integrity: workspaceScore })}%</strong>
            </div>
          </div>
          <section className="product-panel product-registry-panel">
            <div className="product-panel__header">
              <div>
                <h2>Реестр документов</h2>
              </div>
              <Input
                className="product-list-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по реестру"
              />
            </div>
            <div className="product-registry-controls">
              <div className="product-group-grid" role="listbox" aria-label="Группы реестра">
                <button className={`product-group-chip ${groupId === "all" ? "is-active" : ""}`} aria-pressed={groupId === "all"} onClick={() => setGroupId("all")}>
                  <span className="product-group-chip__icon"><FileText size={14} /></span><span className="product-group-chip__label">Все документы</span><b>{documents.length}</b>
                </button>
                {groups.map((group) => {
                  const total = documents.filter((document) => String(document.group_id) === String(group.id)).length;
                  return <button key={group.id} className={`product-group-chip ${String(group.id) === String(groupId) ? "is-active" : ""}`} aria-pressed={String(group.id) === String(groupId)} onClick={() => setGroupId(group.id)}>
                    <span className="product-group-chip__icon"><GroupMarker compact group={group} /></span><span className="product-group-chip__label" title={groupLabel(group)}>{groupLabel(group)}</span><b>{total}</b>
                  </button>;
                })}
              </div>
            </div>
            <div className="product-quick-filters" aria-label="Быстрые фильтры реестра">
              {[
                ["all", "Все"],
                ["attention", "Требуют внимания"],
                ["files", "Без файла"],
                ["completed", "Готово"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={documentFilter === value ? "is-active" : ""}
                  onClick={() => setDocumentFilter(value)}
                >
                  {label}
                </button>
              ))}
              <span>{selected.length} из {documents.length}</span>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Документ</TableHeader>
                  <TableHeader>Группа</TableHeader>
                  <TableHeader>Файл</TableHeader>
                  <TableHeader>Статус</TableHeader>
                  <TableHeader />
                </TableRow>
              </TableHead>
              <TableBody ref={listRef}>
                {selected.map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    groups={groups}
                    onPreview={setPreviewDocument}
                  />
                ))}
              </TableBody>
            </Table>
          </section>
          {previewDocument && <DocumentPreviewDialog document={previewDocument} onOpenChange={(open) => !open && setPreviewDocument(null)} />}
        </>
      )}
    </motion.section>
  );
}

function DocumentPreviewDialog({ document, onOpenChange }) {
  const file = document.file_info || {};
  const url = file.preview_url || api.previewUrl(document.id);
  const mediaType = file.media_type || "";
  const extension = (file.file_extension || "").toLowerCase();
  const image = mediaType.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(extension);
  const pdf = mediaType === "application/pdf" || extension === ".pdf";
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="product-preview-dialog">
      <DialogTitle>{document.title || file.file_name || "Предпросмотр документа"}</DialogTitle>
      <DialogDescription>{file.file_name || document.number || "Файл документа"}</DialogDescription>
      <div className="product-preview-frame">
        {image ? <img src={url} alt={document.title || "Предпросмотр документа"} /> : pdf ? <iframe src={url} title={document.title || "Предпросмотр документа"} /> : <div><FileArchive size={30} /><strong>Для этого формата доступно открытие оригинала</strong><span>Файл сохранён в локальном архиве.</span></div>}
      </div>
      <div className="product-dialog-actions"><Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer">Открыть оригинал</a></Button><Button asChild><a href={`#/editor/${document.id}`}>Карточка документа</a></Button></div>
    </DialogContent>
  </Dialog>;
}

function DocumentRow({ document, groups, onPreview }) {
  const group = groups.find(
    (item) => String(item.id) === String(document.group_id),
  );
  const status = document.completion_status || "not_started";
  const label =
    {
      completed: "Готов",
      in_progress: "В работе",
      needs_revision: "На правках",
      not_started: "Ожидается",
    }[status] || status;
  const canPreview = Boolean(document.has_file || document.source_file);
  return (
    <TableRow>
      <TableCell>
        <div
          className={`product-document-cell ${canPreview ? "is-previewable" : ""}`}
          role={canPreview ? "button" : undefined}
          tabIndex={canPreview ? 0 : undefined}
          title={canPreview ? "Открыть предпросмотр" : undefined}
          onClick={() => canPreview && onPreview(document)}
          onKeyDown={(event) => {
            if (canPreview && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onPreview(document);
            }
          }}
        >
          {group && <GroupMarker compact group={group} />}
          <strong>{document.title || "Без названия"}</strong>
          <small>{document.number || "Без номера"}</small>
        </div>
      </TableCell>
      <TableCell>{group ? <GroupMarker group={group} /> : <span className="product-group-marker"><FileText size={14} aria-hidden="true" /><span>Не назначена</span></span>}</TableCell>
      <TableCell>
        {document.has_file || document.source_file ? (
          <span className="product-file product-file--yes">
            <FileText size={14} /> Есть
          </span>
        ) : (
          <span className="product-file">Нет файла</span>
        )}
      </TableCell>
      <TableCell>
        <span className={`product-status product-status--${status}`}>
          {label}
        </span>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Действия с документом"
            >
              <MoreHorizontal size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(document.has_file || document.source_file) && <DropdownMenuItem onSelect={() => onPreview(document)}>Предпросмотр</DropdownMenuItem>}
            <DropdownMenuItem
              onSelect={() =>
                document.id && navigate(`#/editor/${document.id}`)
              }
            >
              Открыть карточку
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                document.id && window.open(api.fileUrl(document.id), "_blank")
              }
            >
              Скачать файл
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function DocumentEditor({ documentId }) {
  const [document, setDocument] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .documents()
      .then((items) =>
        setDocument(
          items.find((item) => Number(item.id) === Number(documentId)) || null,
        ),
      )
      .catch((cause) =>
        setError(cause.message || "Не удалось загрузить документ"),
      );
  }, [documentId]);
  async function save(event) {
    event.preventDefault();
    if (!document) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateDocument(document.id, {
        title: form.get("title"),
        number: form.get("number"),
        work_title: form.get("work_title"),
        document_date: form.get("document_date") || null,
        completion_status: form.get("completion_status"),
      });
      setDocument((current) => ({ ...current, ...updated }));
    } catch (cause) {
      setError(cause.message || "Не удалось сохранить документ");
    } finally {
      setSaving(false);
    }
  }
  if (!document && !error)
    return (
      <motion.section {...pageMotion} className="product-page">
        <Skeleton rows={5} />
      </motion.section>
    );
  if (!document)
    return (
      <motion.section {...pageMotion} className="product-page">
        <a href="#/objects" className="product-back">
          <ArrowLeft size={15} />
          Все объекты
        </a>
        <PageHeader
          eyebrow="Документ"
          title="Документ не найден"
          description={error || "Позиция могла быть удалена."}
        />
      </motion.section>
    );
  return (
    <motion.section {...pageMotion} className="product-page">
      <a href={`#/objects/${document.object_id}`} className="product-back">
        <ArrowLeft size={15} />К реестру объекта
      </a>
      <PageHeader
        eyebrow={document.number || "Документ"}
        title="Карточка документа"
        description=""
        actions={
          document.has_file || document.source_file ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={api.fileUrl(document.id)}
                target="_blank"
                rel="noreferrer"
              >
                Открыть файл
              </a>
            </Button>
          ) : null
        }
      />
      {error && (
        <div className="product-error">
          <CircleAlert size={17} />
          {error}
        </div>
      )}
      <form className="product-panel product-editor" onSubmit={save}>
        <div className="product-editor__fields">
          <label>
            <span>Название</span>
            <Input name="title" defaultValue={document.title || ""} required />
          </label>
          <label>
            <span>Номер</span>
            <Input name="number" defaultValue={document.number || ""} />
          </label>
          <label>
            <span>Дата документа</span>
            <Input
              name="document_date"
              type="date"
              defaultValue={document.document_date || ""}
            />
          </label>
          <label>
            <span>Статус</span>
            <select
              name="completion_status"
              defaultValue={document.completion_status || "not_started"}
            >
              <option value="not_started">Ожидается</option>
              <option value="in_progress">В работе</option>
              <option value="needs_revision">На правках</option>
              <option value="completed">Готов</option>
            </select>
          </label>
          <label className="product-editor__wide">
            <span>Наименование работ / примечание</span>
            <Input name="work_title" defaultValue={document.work_title || ""} />
          </label>
        </div>
        <footer>
          <span>
            {document.source_file
              ? `Файл: ${document.source_file}`
              : "Файл ещё не добавлен"}
          </span>
          <Button type="submit" disabled={saving}>
            {saving ? "Сохраняю…" : "Сохранить изменения"}
          </Button>
        </footer>
      </form>
    </motion.section>
  );
}

function ImportDialog({ objectId, groups, onComplete }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [listRef] = useAutoAnimate(autoAnimateOptions);
  async function upload() {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files)
        await api.importFile(objectId, file, groupId || null);
      await onComplete();
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent className="product-import-dialog">
      <DialogTitle>Добавить документы</DialogTitle>
      <DialogDescription>
        Файлы сразу попадут в архив выбранного объекта. Исходники не изменяются.
      </DialogDescription>
      <label className="product-dropzone">
        <Upload size={22} />
        <strong>Выберите файлы</strong>
        <span>PDF, DOCX, XLSX, изображения и чертежи</span>
        <input
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
        />
      </label>
      <label className="product-field">
        <span>Группа</span>
        <select
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
        >
          <option value="">Определить позже</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {groupLabel(group)}
            </option>
          ))}
        </select>
      </label>
      <div ref={listRef} className="product-upload-list">
        {files.map((file) => (
          <div key={`${file.name}-${file.lastModified}`}>
            <FilePlus2 size={16} />
            <span>{file.name}</span>
            <small>{Math.max(1, Math.round(file.size / 1024))} КБ</small>
            <button
              onClick={() =>
                setFiles((current) => current.filter((item) => item !== file))
              }
              aria-label={`Убрать ${file.name}`}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="product-dialog-actions">
        <Button variant="secondary" onClick={() => setFiles([])}>
          Очистить
        </Button>
        <Button disabled={!files.length || busy} onClick={upload}>
          {busy ? (
            "Загружаю…"
          ) : (
            <>
              <Upload size={16} />
              Добавить {files.length || ""}
            </>
          )}
        </Button>
      </div>
    </DialogContent>
  );
}

function TemplateLibrary({ objects, currentObjectId }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [listRef] = useAutoAnimate(autoAnimateOptions);
  const load = useCallback(() => {
    setLoading(true);
    return api
      .templates()
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <motion.section {...pageMotion} className="product-page">
      <PageHeader
        eyebrow="Библиотека"
        title="Шаблоны документов"
        description=""
        actions={<Button onClick={() => setCreateOpen(true)}><FilePlus2 size={16} /> Добавить шаблон</Button>}
      />
      <section className="product-panel">
        <div ref={listRef} className="product-template-list">
          {loading ? (
            <Skeleton rows={4} />
          ) : templates.length ? (
            templates.map((template) => (
              <motion.article
                layout
                key={template.id}
                className="product-template"
              >
                <span className="product-template__icon">
                  <FileText size={18} />
                </span>
                <div>
                  <strong>{template.title}</strong>
                  <small>
                    {template.doc_type || "Документ"} ·{" "}
                    {template.group_kind || "Без группы"}
                  </small>
                </div>
                <span
                  className={
                    template.template_file
                      ? "product-file product-file--yes"
                      : "product-file"
                  }
                >
                  {template.template_file ? "Файл есть" : "Нет файла"}
                </span>
                <Button size="sm" variant="outline" onClick={() => setSelectedTemplate(template)}>
                  <Plus size={15} /> В объект
                </Button>
              </motion.article>
            ))
          ) : (
            <div className="product-empty-state">
              <span><FilePlus2 size={22} /></span>
              <strong>В библиотеке пока нет шаблонов</strong>
              <p>Загрузите DOCX, XLSX или PDF: затем его можно добавить в любой объект одной кнопкой.</p>
              <Button size="sm" onClick={() => setCreateOpen(true)}><FilePlus2 size={15} /> Добавить первый шаблон</Button>
            </div>
          )}
        </div>
      </section>
      {createOpen && <NewTemplateDialog onOpenChange={setCreateOpen} onCreated={load} />}
      {selectedTemplate && <AddTemplateToObjectDialog template={selectedTemplate} objects={objects} currentObjectId={currentObjectId} onOpenChange={(open) => !open && setSelectedTemplate(null)} />}
    </motion.section>
  );
}

function NewTemplateDialog({ onOpenChange, onCreated }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("other");
  const [groupKind, setGroupKind] = useState("acts");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      await api.createTemplate({ file, title, docType, groupKind, notes });
      await onCreated();
      onOpenChange(false);
    } catch (cause) {
      setError(cause.message || "Не удалось добавить шаблон");
    } finally {
      setSaving(false);
    }
  };
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="product-template-dialog">
      <DialogTitle>Добавить шаблон</DialogTitle>
      <DialogDescription>Загрузите исходный DOCX, XLSX или PDF. Маркеры вида {"{{zakazchik}}"} сохранятся для автоподстановки данных объекта.</DialogDescription>
      <label className="product-template-file"><input type="file" accept=".docx,.xlsx,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><FilePlus2 size={19} /><span>{file ? file.name : "Выберите файл шаблона"}</span><small>DOCX, XLSX или PDF, до 25 МБ</small></label>
      <label className="product-field"><span>Название</span><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "Например, Акт освидетельствования"} /></label>
      <div className="product-form-grid">
        <label className="product-field"><span>Тип документа</span><select value={docType} onChange={(event) => setDocType(event.target.value)}><option value="aosr">Акт освидетельствования</option><option value="journal">Журнал</option><option value="permit">Разрешительный документ</option><option value="passport">Паспорт / сертификат</option><option value="other">Другое</option></select></label>
        <label className="product-field"><span>Группа</span><select value={groupKind} onChange={(event) => setGroupKind(event.target.value)}><option value="registry">Реестр</option><option value="working">Проектная документация</option><option value="permits">Разрешительная документация</option><option value="journals">Журналы</option><option value="acts">Акты и испытания</option><option value="schemes">Исполнительные схемы</option><option value="quality">Материалы и паспорта</option><option value="other">Прочее</option></select></label>
      </div>
      <label className="product-field"><span>Примечание</span><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Необязательно" /></label>
      {error && <div className="product-error">{error}</div>}
      <div className="product-dialog-actions"><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button disabled={saving || !file} onClick={save}>{saving ? "Добавляю…" : "Добавить шаблон"}</Button></div>
    </DialogContent>
  </Dialog>;
}

function AddTemplateToObjectDialog({ template, objects, currentObjectId, onOpenChange }) {
  const [objectId, setObjectId] = useState(String(currentObjectId || objects[0]?.id || ""));
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!objectId) return;
    setGroupId("");
    api.workspace(objectId).then((workspace) => setGroups(workspace.groups || [])).catch(() => setGroups([]));
  }, [objectId]);
  const add = async () => {
    if (!objectId) return;
    setSaving(true);
    setError("");
    try {
      await api.copyTemplate(template.id, { object_id: Number(objectId), group_id: groupId ? Number(groupId) : null });
      navigate(`#/objects/${objectId}`);
      onOpenChange(false);
    } catch (cause) {
      setError(cause.message || "Не удалось добавить шаблон");
    } finally {
      setSaving(false);
    }
  };
  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogTitle>Добавить шаблон в объект</DialogTitle>
      <DialogDescription>{template.title}. Создастся новая позиция реестра с исходным шаблоном.</DialogDescription>
      <label className="product-field"><span>Объект</span><select value={objectId} onChange={(event) => setObjectId(event.target.value)}>{objects.map((object) => <option key={object.id} value={object.id}>{object.code || "—"} · {objectTitle(object)}</option>)}</select></label>
      <label className="product-field"><span>Группа</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Определить позже</option>{groups.map((group) => <option key={group.id} value={group.id}>{groupLabel(group)}</option>)}</select></label>
      {error && <div className="product-error">{error}</div>}
      <div className="product-dialog-actions"><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button><Button disabled={saving || !objectId} onClick={add}>{saving ? "Добавляю…" : "Добавить"}</Button></div>
    </DialogContent>
  </Dialog>;
}

function DiagnosticsDialog() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.autocadDiagnostics());
    } catch (cause) {
      setReport({
        connected: false,
        detail: cause.message,
        checks: [
          {
            id: "service",
            label: "Сервис AutoCAD",
            ok: false,
            detail: cause.message,
          },
        ],
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const checks = report?.checks || report?.items || [];
  const connected = Boolean(report?.connected ?? report?.status?.connected);
  return (
    <DialogContent className="product-diagnostics">
      <DialogTitle>Диагностика AutoCAD</DialogTitle>
      <DialogDescription>
        Проверка локального сервиса, процесса AutoCAD и COM-подключения.
      </DialogDescription>
      {loading ? (
        <Skeleton rows={3} />
      ) : (
        <div className="product-diagnostics__list">
          {checks.map((check) => (
            <div key={check.id || check.label}>
              <span className={check.ok ? "is-ok" : "is-error"}>
                {check.ok ? "Готово" : "Проверить"}
              </span>
              <strong>{check.label || check.title}</strong>
              <small>
                {check.detail || check.message || "Нет подробностей"}
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="product-dialog-actions">
        <Button variant="secondary" onClick={load}>
          <RefreshCw size={15} />
          Обновить
        </Button>
        {!connected && (
          <Button
            disabled={launching}
            onClick={async () => {
              setLaunching(true);
              try {
                await api.launchAutocad();
              } finally {
                setLaunching(false);
                await load();
              }
            }}
          >
            <Play size={15} />
            {launching ? "Запускаю…" : "Запустить AutoCAD"}
          </Button>
        )}
      </div>
    </DialogContent>
  );
}

const emptyAutocadSkill = {
  title: "",
  category: "general",
  description: "",
  command_name: "ID_NewCommand",
  code_content: ";; AutoLISP command for ID Vault\n(defun c:ID_NewCommand ()\n  (princ \"\\nID Vault command ready.\")\n  (princ)\n)\n",
  version: "1.0",
};

function AutocadSkillDialog({ skill, onOpenChange, onChanged }) {
  const [draft, setDraft] = useState(skill || emptyAutocadSkill);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(Boolean(skill));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(skill || emptyAutocadSkill);
    setMessage("");
    if (!skill?.id) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([api.autocadSkill(skill.id), api.autocadSkillHistory(skill.id)])
      .then(([nextSkill, nextHistory]) => {
        setDraft(nextSkill);
        setHistory(Array.isArray(nextHistory) ? nextHistory : []);
      })
      .catch((cause) => setMessage(cause.message || "Не удалось загрузить скилл"))
      .finally(() => setLoading(false));
  }, [skill]);
  const set = (field) => (event) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        title: draft.title.trim(),
        category: draft.category,
        description: draft.description,
        command_name: draft.command_name.trim(),
        code_content: draft.code_content,
        version: draft.version.trim() || "1.0",
      };
      if (skill?.id) await api.updateAutocadSkill(skill.id, payload);
      else await api.createAutocadSkill(payload);
      await onChanged();
      onOpenChange(false);
    } catch (cause) {
      setMessage(cause.message || "Не удалось сохранить скилл");
    } finally {
      setSaving(false);
    }
  };
  const rollback = async (version) => {
    if (!skill?.id) return;
    setSaving(true);
    try {
      await api.rollbackAutocadSkill(skill.id, version);
      await onChanged();
      setMessage(`Восстановлена версия ${version}`);
    } catch (cause) {
      setMessage(cause.message || "Не удалось восстановить версию");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!skill?.id || skill.is_builtin) return;
    if (!confirm(`Удалить «${skill.title}»?`)) return;
    setSaving(true);
    try {
      await api.deleteAutocadSkill(skill.id);
      await onChanged();
      onOpenChange(false);
    } catch (cause) {
      setMessage(cause.message || "Не удалось удалить скилл");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="product-cad-dialog">
        <DialogTitle>{skill ? "Настройка команды" : "Новая команда AutoCAD"}</DialogTitle>
        <DialogDescription>
          {skill ? "Код, версия и параметры команды." : "Создайте пользовательскую команду AutoLISP."}
        </DialogDescription>
        {loading ? <Skeleton rows={5} /> : (
          <form className="product-cad-form" onSubmit={save}>
            <div className="product-cad-form__grid">
              <label>Название<Input value={draft.title} onChange={set("title")} required /></label>
              <label>Команда<Input value={draft.command_name} onChange={set("command_name")} required /></label>
              <label>Категория<select value={draft.category} onChange={set("category")}><option value="general">Общие</option><option value="marks">Отметки</option><option value="polyline">Трубопроводы</option><option value="blocks">Блоки</option><option value="stamps">Штампы</option><option value="print">Печать</option></select></label>
              <label>Версия<Input value={draft.version} onChange={set("version")} /></label>
            </div>
            <label>Описание<Input value={draft.description} onChange={set("description")} /></label>
            <label>Код AutoLISP<textarea value={draft.code_content} onChange={set("code_content")} spellCheck="false" required /></label>
            {history.length > 0 && <section className="product-cad-history"><strong><History size={15} /> Предыдущие версии</strong><div>{history.map((item) => <Button key={item.version} type="button" variant="outline" size="sm" disabled={saving} onClick={() => rollback(item.version)}>v{item.version}</Button>)}</div></section>}
            {message && <p className="product-cad-message">{message}</p>}
            <footer>
              {skill && !skill.is_builtin ? <Button type="button" variant="danger" size="sm" disabled={saving} onClick={remove}><Trash2 size={14} />Удалить</Button> : <span />}
              <Button type="submit" disabled={saving}><Save size={15} />{saving ? "Сохраняю…" : "Сохранить"}</Button>
            </footer>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AutocadWorkspace() {
  const [skills, setSkills] = useState([]);
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState(undefined);
  const [lastResult, setLastResult] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSkills, diagnostics, nextLogs] = await Promise.all([
        api.autocadSkills(category, query),
        api.autocadDiagnostics(),
        api.autocadLogs().catch(() => []),
      ]);
      // The bridge normally returns a list. Accept its older wrapper as well
      // so a service update cannot make the AutoCAD workspace disappear.
      setSkills(
        Array.isArray(nextSkills)
          ? nextSkills
          : nextSkills?.value || nextSkills?.items || [],
      );
      const processRunning = diagnostics?.checks?.some(
        (check) => check.id === "acad_process" && check.ok,
      );
      setStatus({
        ...(diagnostics?.status || {}),
        running: processRunning || diagnostics?.status?.running,
      });
      setLogs(Array.isArray(nextLogs) ? nextLogs : []);
      setError("");
    } catch (cause) {
      setSkills([]);
      setStatus({ connected: false });
      setError(cause.message || "Сервис AutoCAD недоступен");
    } finally {
      setLoading(false);
    }
  }, [category, query]);
  useEffect(() => {
    const timer = setTimeout(load, query ? 180 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);
  const categories = [
    { id: "all", label: "Все скиллы" },
    { id: "marks", label: "Высотные отметки" },
    { id: "polyline", label: "Трубопроводы" },
    { id: "blocks", label: "Блоки" },
    { id: "stamps", label: "Штампы ИД" },
    { id: "print", label: "Печать PDF" },
    { id: "general", label: "Общие" },
  ];
  const [listRef] = useAutoAnimate(autoAnimateOptions);
  const runSkill = async (skill) => {
    setRunning(skill.id);
    setLastResult("");
    try {
      const result = await api.executeAutocadSkill(skill.id);
      setLastResult(result.message || `Команда «${skill.title}» передана в AutoCAD`);
      setLogs(await api.autocadLogs().catch(() => logs));
    } catch (cause) {
      setLastResult(cause.message || "Не удалось передать команду");
    } finally {
      setRunning(null);
    }
  };
  return (
    <motion.section {...pageMotion} className="product-page">
      <PageHeader
        eyebrow="Интеграция"
        title="AutoCAD workspace"
        description=""
        actions={
          <>
            <span
              className={`product-cad-status ${status?.connected ? "is-online" : "is-offline"}`}
            >
              {status?.connected
                ? status.active_document || "AutoCAD подключён"
                : status?.running
                  ? "AutoCAD запущен — откройте чертёж"
                  : "AutoCAD не подключён"}
            </span>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw size={15} />
              Обновить
            </Button>
            <Button size="sm" onClick={() => setSelectedSkill(null)}><Plus size={15} />Новая команда</Button>
          </>
        }
      />
      <section className="product-panel product-cad-toolbar">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по скиллам"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </section>
      {lastResult && <p className="product-cad-message product-cad-message--result">{lastResult}</p>}
      {loading ? (
        <Skeleton rows={4} />
      ) : error ? (
        <section className="product-cad-offline">
          <MonitorCog size={28} />
          <strong>Сервис AutoCAD сейчас недоступен</strong>
          <p>{error}</p>
          <span>
            Функции сохранены: после запуска локального сервиса здесь появятся
            библиотека скиллов и команды.
          </span>
        </section>
      ) : (
        <div ref={listRef} className="product-cad-grid">
          {skills.map((skill) => (
            <motion.article layout key={skill.id} className="product-cad-card">
              <div>
                <span className="product-code">
                  {skill.category || "общий"}
                </span>
                <h2>{skill.title}</h2>
                <p>{skill.description}</p>
              </div>
              <footer>
                <code>{skill.command_name}</code>
                <div className="product-cad-card__actions"><Button variant="ghost" size="sm" onClick={() => setSelectedSkill(skill)}>Код</Button><Button size="sm" disabled={running === skill.id || !status?.connected} onClick={() => runSkill(skill)}>
                  <Play size={14} />
                  {running === skill.id ? "Передаю…" : "В AutoCAD"}
                </Button></div>
              </footer>
            </motion.article>
          ))}
        </div>
      )}
      {logs.length > 0 && <section className="product-panel product-cad-logs"><div><span className="product-code">журнал запусков</span><h2>Последние команды</h2></div><div>{logs.slice(0, 5).map((log) => <p key={log.id}><strong>{log.skill_title}</strong><span>{log.dwg_name}</span><time>{new Date(log.executed_at).toLocaleString("ru-RU")}</time></p>)}</div></section>}
      {selectedSkill !== undefined && <AutocadSkillDialog skill={selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(undefined)} onChanged={load} />}
    </motion.section>
  );
}

function Completeness({ objects, currentObjectId, onSelectCurrent }) {
  const [listRef] = useAutoAnimate(autoAnimateOptions);
  const [report, setReport] = useState(null);
  const [objectId, setObjectId] = useState(currentObjectId || "");
  useEffect(() => setObjectId(currentObjectId || ""), [currentObjectId]);
  useEffect(() => {
    api
      .report(objectId || null)
      .then(setReport)
      .catch(() => setReport(null));
  }, [objectId]);
  const sections = report?.sections || [];
  return (
    <motion.section {...pageMotion} className="product-page">
      <PageHeader
        eyebrow="Контроль архива"
        title="Комплектность"
        description=""
        actions={<><select className="product-report-object" aria-label="Объект для диаграммы" value={objectId} onChange={(event) => setObjectId(Number(event.target.value))}>{objects.map((item) => <option key={item.id} value={item.id}>{item.code || "—"} · {objectTitle(item)}</option>)}</select>{Number(objectId) !== Number(currentObjectId) && <Button size="sm" variant="outline" onClick={async () => { await api.selectObject(objectId); await onSelectCurrent(); }}>Сделать текущим</Button>}</>}
      />
      {report && (
        <section className="product-chart-grid">
          <article className="product-panel product-donut-card">
            <div
              className="product-donut"
              style={{
                "--progress": `${Math.max(0, Math.min(100, Number(report.progress) || 0))}%`,
              }}
            >
              <strong>{report.progress}%</strong>
              <span>готовность</span>
            </div>
            <div>
              <strong>
                {count(report.ready)} из {count(report.total)}
              </strong>
              <p>позиций готовы к сдаче</p>
            </div>
          </article>
          <section className="product-panel product-section-chart">
            <header>
              <div>
                <h2>Структура комплекта</h2>
                <p>Наличие документов по разделам.</p>
              </div>
              <BarChart3 size={18} />
            </header>
            <div className="product-section-bars">
              {sections
                .filter((item) => item.total || item.records)
                .slice(0, 8)
                .map((item) => {
                  const percent = item.total
                    ? Math.round(((Number(item.ready) || 0) / item.total) * 100)
                    : 0;
                  return (
                    <div key={item.title}>
                      <span>{item.title}</span>
                      <i>
                        <b style={{ width: `${percent}%` }} />
                      </i>
                      <strong>{percent}%</strong>
                    </div>
                  );
                })}
            </div>
          </section>
        </section>
      )}
      <section className="product-panel">
        <div ref={listRef} className="product-completeness-list">
          {objects.map((object) => (
            <motion.a
              layout
              href={`#/objects/${object.id}`}
              key={object.id}
              className="product-completeness-row"
            >
              <div>
                <span className="product-code">{object.code || "—"}</span>
                <strong>{objectTitle(object)}</strong>
              </div>
              <div className="product-score product-score--wide">
                <span>
                  <i style={{ width: `${score(object)}%` }} />
                </span>
                <b>{score(object)}%</b>
              </div>
              <span>{count(object.documents_count)} документов</span>
              <ChevronRight size={16} />
            </motion.a>
          ))}
        </div>
      </section>
    </motion.section>
  );
}

function NewObjectDialog() {
  return (
    <DialogContent>
      <DialogTitle>Новый объект</DialogTitle>
      <DialogDescription>
        Создайте рабочее пространство, а затем добавьте реестр и файлы.
      </DialogDescription>
      <form
        className="product-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await api.addObject({
            code: form.get("code"),
            name: form.get("name"),
            address: form.get("address"),
          });
          location.hash = "#/objects";
          location.reload();
        }}
      >
        <label>
          <span>Код объекта</span>
          <Input name="code" required placeholder="СНГ-03" />
        </label>
        <label>
          <span>Название</span>
          <Input name="name" required placeholder="Наименование объекта" />
        </label>
        <label>
          <span>Адрес</span>
          <Input name="address" placeholder="Город, улица" />
        </label>
        <Button type="submit">Создать объект</Button>
      </form>
    </DialogContent>
  );
}

export function ProductApp() {
  const route = useRoute();
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setObjects(await api.objectSummaries());
      setError("");
    } catch (cause) {
      setError(cause.message || "Не удалось загрузить архив");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const currentObjectId = objects.find((item) => item.is_current)?.id || objects[0]?.id || null;
  let view =
    route.key === "objects" ? (
      <ObjectList objects={objects} loading={loading} />
    ) : route.key === "object" ? (
      <ObjectWorkspace objectId={route.objectId} onRefresh={refresh} />
    ) : route.key === "editor" ? (
      <DocumentEditor documentId={route.documentId} />
    ) : route.key === "templates" ? (
      <TemplateLibrary objects={objects} currentObjectId={currentObjectId} />
    ) : route.key === "autocad" ? (
      <AutocadWorkspace />
    ) : route.key === "reports" ? (
      <Completeness objects={objects} currentObjectId={currentObjectId} onSelectCurrent={refresh} />
    ) : (
      <Dashboard objects={objects} loading={loading} />
    );
  return (
    <ProductShell route={route} objects={objects} onNewObject={refresh} onSelectCurrent={refresh}>
      {error ? (
        <div className="product-error">
          <CircleAlert size={17} />
          {error}
        </div>
      ) : (
        view
      )}
    </ProductShell>
  );
}
