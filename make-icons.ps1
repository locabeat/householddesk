# Φτιάχνει τα εικονίδια του app από το icons/icon-source.png (το σχέδιο της Άννας).
#  - icon-512 / icon-192 / apple-touch-icon: γεμίζουν όλο το τετράγωνο (χωρίς διαφάνεια),
#    γιατί το iPhone βάφει τη διαφάνεια μαύρη και τα κινητά στρογγυλεύουν μόνα τους τις γωνίες.
#  - favicon: η στρογγυλεμένη μορφή με διαφάνεια, για την καρτέλα του browser.
# Τρέχει με: powershell -ExecutionPolicy Bypass -File make-icons.ps1
param([string]$Source = (Join-Path $PSScriptRoot 'icons\icon-source.png'))

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconTool {
    // Όλα τα pixel σε πίνακα (ARGB), για γρήγορη επεξεργασία.
    static int[] Read(Bitmap b) {
        var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var px = new int[b.Width * b.Height];
        Marshal.Copy(d.Scan0, px, 0, px.Length);
        b.UnlockBits(d);
        return px;
    }
    static Bitmap Write(int[] px, int w, int h) {
        var b = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        var d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(px, 0, d.Scan0, px.Length);
        b.UnlockBits(d);
        return b;
    }
    static int A(int p) { return (p >> 24) & 255; }

    // Το τετράγωνο του εικονιδίου μέσα στην εικόνα (ό,τι δεν είναι διάφανο).
    public static Rectangle Bounds(Bitmap b) {
        int[] px = Read(b);
        int w = b.Width, h = b.Height, minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                if (A(px[y * w + x]) >= 200) {
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
        return Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
    }

    // Κόβει μέσα από το πλαίσιο (inset) και γεμίζει τις διάφανες γωνίες με το χρώμα
    // που βρίσκει προχωρώντας προς το κέντρο, ώστε να συνεχίζεται το πετρόλ.
    public static Bitmap FullBleed(Bitmap src, Rectangle box, double insetFrac) {
        int inset = (int)(Math.Max(box.Width, box.Height) * insetFrac);
        Rectangle r = Rectangle.Inflate(box, -inset, -inset);
        int n = Math.Min(r.Width, r.Height);
        r = new Rectangle(r.X + (r.Width - n) / 2, r.Y + (r.Height - n) / 2, n, n);
        int[] px;
        using (Bitmap c = src.Clone(r, PixelFormat.Format32bppArgb)) px = Read(c);
        int[] o = new int[px.Length];
        double cx = n / 2.0, cy = n / 2.0;
        for (int y = 0; y < n; y++)
            for (int x = 0; x < n; x++) {
                int p = px[y * n + x], a = A(p);
                if (a == 255) { o[y * n + x] = p; continue; }
                double dx = cx - x, dy = cy - y, len = Math.Sqrt(dx * dx + dy * dy);
                int fill = p;
                if (len >= 1) {
                    dx /= len; dy /= len;
                    for (int k = 1; k < len; k++) {
                        int sx = Math.Min(n - 1, Math.Max(0, (int)(x + dx * k)));
                        int sy = Math.Min(n - 1, Math.Max(0, (int)(y + dy * k)));
                        int q = px[sy * n + sx];
                        if (A(q) == 255) { fill = q; break; }
                    }
                }
                double t = a / 255.0;
                int R = (int)(((p >> 16) & 255) * t + ((fill >> 16) & 255) * (1 - t));
                int G = (int)(((p >> 8) & 255) * t + ((fill >> 8) & 255) * (1 - t));
                int B = (int)((p & 255) * t + (fill & 255) * (1 - t));
                o[y * n + x] = unchecked((int)0xFF000000) | (R << 16) | (G << 8) | B;
            }
        return Write(o, n, n);
    }

    public static void Save(Bitmap img, int size, string path) {
        using (Bitmap b = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        using (Graphics g = Graphics.FromImage(b)) {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            using (ImageAttributes wrap = new ImageAttributes()) {
                wrap.SetWrapMode(WrapMode.TileFlipXY);   // χωρίς θολές άκρες
                g.DrawImage(img, new Rectangle(0, 0, size, size), 0, 0, img.Width, img.Height, GraphicsUnit.Pixel, wrap);
            }
            b.Save(path, ImageFormat.Png);
        }
    }
}
'@

$dir = Join-Path $PSScriptRoot 'icons'
$src = New-Object System.Drawing.Bitmap $Source
$box = [IconTool]::Bounds($src)
Write-Host "Τετράγωνο εικονιδίου: $box"

# Για κινητά: χωρίς το ανοιχτόχρωμο πλαίσιο της άκρης, γεμάτο πετρόλ ως τις γωνίες.
$full = [IconTool]::FullBleed($src, $box, 0.03)
[IconTool]::Save($full, 512, (Join-Path $dir 'icon-512.png'))
[IconTool]::Save($full, 192, (Join-Path $dir 'icon-192.png'))
[IconTool]::Save($full, 180, (Join-Path $dir 'apple-touch-icon.png'))

# Για την καρτέλα του browser: η στρογγυλεμένη μορφή, με διαφάνεια.
$tab = $src.Clone($box, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
[IconTool]::Save($tab, 64, (Join-Path $dir 'favicon.png'))

$full.Dispose(); $tab.Dispose(); $src.Dispose()
Write-Host 'OK'
