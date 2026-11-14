"""Write solid-colour square PNGs for test/fixture.html. Uses only zlib and struct."""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)


def png(size, rgb):
    row = b'\x00' + bytes(rgb) * size
    raw = row * size
    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    out = os.path.join(HERE, 'img')
    os.makedirs(out, exist_ok=True)
    for size, rgb in ((100, (200, 60, 60)), (800, (60, 160, 60)), (1600, (60, 60, 200))):
        with open(os.path.join(out, '%d.png' % size), 'wb') as f:
            f.write(png(size, rgb))


if __name__ == '__main__':
    main()
