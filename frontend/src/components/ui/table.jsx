import { cn } from "../../lib/utils.js";

export function Table({ className, ...props }) {
  return (
    <div className="ui-table-wrap">
      <table className={cn("ui-table", className)} {...props} />
    </div>
  );
}
export function TableHead({ className, ...props }) {
  return <thead className={cn("ui-table__head", className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={className} {...props} />;
}
export function TableRow({ className, ...props }) {
  return <tr className={cn("ui-table__row", className)} {...props} />;
}
export function TableHeader({ className, ...props }) {
  return <th className={cn("ui-table__header", className)} {...props} />;
}
export function TableCell({ className, ...props }) {
  return <td className={cn("ui-table__cell", className)} {...props} />;
}
