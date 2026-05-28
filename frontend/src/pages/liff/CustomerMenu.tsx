import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerApi, type CustomerMenuItem } from "@/services/customerApi";

export default function CustomerMenuPage() {
  const [menus, setMenus] = useState<CustomerMenuItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    customerApi
      .listMenu()
      .then((m) => setMenus(m))
      .catch((e: any) => setError(e?.message || "Failed to load menu"));
  }, []);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">Brewway Pick-up Order</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {menus.map((m) => (
        <Link key={m.id} to={`/liff/menu/${m.id}`} className="block border rounded-xl p-3">
          <p className="font-medium">{m.name}</p>
          {m.description ? <p className="text-xs text-muted-foreground mt-1">{m.description}</p> : null}
          <p className="text-sm text-muted-foreground mt-1">฿{m.price}</p>
        </Link>
      ))}
    </div>
  );
}
