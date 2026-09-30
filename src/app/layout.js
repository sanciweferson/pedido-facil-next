import "./globals.css";

export const metadata = {
  title: "Pedido Fácil | Restaurante",
  description: "Pedidos e conferência de estoque por setor",
  icons: { icon: "/pedido-facil-mark.svg", apple: "/pedido-facil-mark.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
