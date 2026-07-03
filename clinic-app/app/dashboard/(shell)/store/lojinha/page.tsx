import { StoreTabs } from '../store-tabs';

type LojinhaItem = {
  name: string;
  description: string;
  price: string;
  category: string;
};

const LOJINHA_ITEMS: LojinhaItem[] = [
  {
    name: 'Kit de luvas descartáveis (caixa c/ 100)',
    description: 'Luvas de procedimento em nitrila, tamanhos P, M e G.',
    price: 'R$ 39,90',
    category: 'Insumos',
  },
  {
    name: 'Touca descartável (pacote c/ 100)',
    description: 'Touca sanfonada em TNT, uso único.',
    price: 'R$ 24,90',
    category: 'Insumos',
  },
  {
    name: 'Álcool 70% (5 litros)',
    description: 'Antisséptico para superfícies e mãos.',
    price: 'R$ 59,90',
    category: 'Insumos',
  },
  {
    name: 'Papel lençol hospitalar (rolo)',
    description: 'Papel para maca, 70cm x 50m.',
    price: 'R$ 32,90',
    category: 'Insumos',
  },
  {
    name: 'Talão de receituário personalizado (100 folhas)',
    description: 'Impressão com a identidade visual da sua clínica.',
    price: 'R$ 89,90',
    category: 'Papelaria',
  },
  {
    name: 'Banner de recepção personalizado',
    description: 'Banner em lona 90x120cm com a marca da clínica.',
    price: 'R$ 149,90',
    category: 'Papelaria',
  },
  {
    name: 'Maca de exame estofada',
    description: 'Maca clínica com revestimento em courino, altura fixa.',
    price: 'R$ 1.299,00',
    category: 'Equipamentos',
  },
  {
    name: 'Negatoscópio de parede',
    description: 'Painel de LED para visualização de exames de imagem.',
    price: 'R$ 349,90',
    category: 'Equipamentos',
  },
];

const CATEGORIES = Array.from(new Set(LOJINHA_ITEMS.map((item) => item.category)));

export default function LojinhaPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Lojinha</h1>
        <p className="text-sm text-gray-500">
          Insumos, papelaria e equipamentos para sua clínica, com entrega facilitada.
        </p>
      </div>

      <StoreTabs />

      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Catálogo de produtos do marketplace de parceiros. A finalização de pedidos depende
        de integração com um provedor de pagamentos/checkout ainda não configurado.
      </p>

      {CATEGORIES.map((category) => (
        <div key={category} className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{category}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOJINHA_ITEMS.filter((item) => item.category === category).map((item) => (
              <div key={item.name} className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                <p className="text-xs text-gray-500">{item.description}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-brand-700">{item.price}</span>
                  <span className="text-xs text-gray-400">Comprar (em breve)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
