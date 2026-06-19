import { Check, X } from "lucide-react";

const rows = [
  { feature: "AI conversation", casa: true, toniebox: false, codi: true, moxie: true },
  { feature: "Parent/grandparent voice clone", casa: true, toniebox: false, codi: false, moxie: false },
  { feature: "Screen-free plush design", casa: true, toniebox: true, codi: true, moxie: false },
  { feature: "Heritage language mode", casa: true, toniebox: false, codi: false, moxie: false },
  { feature: "Open-ended creative play", casa: true, toniebox: false, codi: true, moxie: true },
  { feature: "No required subscription", casa: true, toniebox: true, codi: false, moxie: false },
];

export function Comparison() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold text-casa-goldLight sm:text-4xl">
          How Casa Companion Compares
        </h2>
        <div className="mt-10 overflow-hidden rounded-2xl border border-casa-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-casa-gold/10 text-casa-goldLight">
              <tr>
                <th className="p-4 font-serif">Feature</th>
                <th className="p-4 text-center">Casa</th>
                <th className="p-4 text-center">Toniebox</th>
                <th className="p-4 text-center">Codi</th>
                <th className="p-4 text-center">Moxie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-casa-border">
              {rows.map((row) => (
                <tr key={row.feature} className="bg-casa-card">
                  <td className="p-4 font-medium text-casa-cream">{row.feature}</td>
                  {[row.casa, row.toniebox, row.codi, row.moxie].map((val, i) => (
                    <td key={i} className="p-4 text-center">
                      {val ? (
                        <Check className="mx-auto text-green-500" size={18} />
                      ) : (
                        <X className="mx-auto text-casa-taupe/50" size={18} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
