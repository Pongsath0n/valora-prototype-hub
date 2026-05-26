import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { menuCatalogService, type MenuItem } from "@/features/store/catalogService";

export default function CustomerMenuPage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  useEffect(() => { menuCatalogService.list().then((m) => setMenus(m.filter(x=>x.isActive))); }, []);
  return <div className="max-w-md mx-auto p-4 space-y-4"><h1 className="text-xl font-bold">Brewway Pick-up Order</h1>{menus.map(m=><Link key={m.id} to={`/liff/menu/${m.id}`} className="block border rounded-xl p-3"><p className="font-medium">{m.name}</p><p className="text-sm text-muted-foreground">฿{m.basePrice}</p></Link>)}</div>;
}
