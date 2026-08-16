import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const AuraApp());
}

const _scanProfiles = {
  'Rápido — Solo descubrimiento (~5 min)': '8715c877-47a0-438d-98a3-27c7a6ab2196',
  'Normal — Full & Fast (~30 min)': 'daba56c8-73ec-11df-a475-002264764cea',
  'Profundo — Full & Very Deep (~60 min)': '708f25c4-7489-11df-8a11-002264764cea',
  'Máximo — Full & Very Deep Ultimate (~90 min)': '74db13d6-7489-11df-91b9-002264764cea',
};

// Paleta compartida con el Security Lab Launcher (tkinter)
const _bg = Color(0xFF0F172A);
const _surface = Color(0xFF1E293B);
const _border = Color(0xFF334155);
const _text = Color(0xFFE2E8F0);
const _muted = Color(0xFF94A3B8);
const _cyan = Color(0xFF06B6D4);
const _green = Color(0xFF22C55E);
const _red = Color(0xFFEF4444);

class AuraApp extends StatelessWidget {
  const AuraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Aura — Security Lab',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: _bg,
        colorScheme: const ColorScheme.dark(
          primary: _cyan,
          surface: _surface,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: _bg,
          border: OutlineInputBorder(),
        ),
      ),
      home: const ScanTriggerPage(),
    );
  }
}

class ScanTriggerPage extends StatefulWidget {
  const ScanTriggerPage({super.key});

  @override
  State<ScanTriggerPage> createState() => _ScanTriggerPageState();
}

class _ScanTriggerPageState extends State<ScanTriggerPage> {
  final _hostCtrl = TextEditingController(text: '192.168.100.143');
  final _subnetCtrl = TextEditingController(text: '192.168.100.0/24');
  String _profileName = _scanProfiles.keys.elementAt(1);
  bool _sending = false;
  String? _lastMessage;
  bool _lastOk = false;

  Future<void> _triggerScan() async {
    setState(() {
      _sending = true;
      _lastMessage = null;
    });

    final host = _hostCtrl.text.trim();
    final subnet = _subnetCtrl.text.trim();
    final profileId = _scanProfiles[_profileName];
    final uri = Uri.parse(
      'http://$host:5678/webhook/nmap-v3?scan_config=$profileId&subnet=$subnet',
    );

    try {
      final resp = await http
          .post(uri)
          .timeout(const Duration(seconds: 10));
      setState(() {
        _lastOk = resp.statusCode == 200;
        _lastMessage = _lastOk
            ? 'Escaneo disparado. Vas a recibir el resultado por Telegram y email cuando termine.'
            : 'HTTP ${resp.statusCode}: ${resp.body}';
      });
    } catch (e) {
      setState(() {
        _lastOk = false;
        _lastMessage = 'Error de conexión: $e';
      });
    } finally {
      setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _surface,
        title: const Text(
          'Aura — Security Lab',
          style: TextStyle(color: _cyan, fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Banner(),
            const SizedBox(height: 20),
            _label('Host de n8n (IP del servidor)'),
            TextField(
              controller: _hostCtrl,
              style: const TextStyle(color: _text),
            ),
            const SizedBox(height: 16),
            _label('Subred a escanear (CIDR)'),
            TextField(
              controller: _subnetCtrl,
              style: const TextStyle(color: _text),
            ),
            const SizedBox(height: 16),
            _label('Perfil de escaneo'),
            DropdownButtonFormField<String>(
              initialValue: _profileName,
              dropdownColor: _surface,
              style: const TextStyle(color: _text),
              items: _scanProfiles.keys
                  .map((k) => DropdownMenuItem(value: k, child: Text(k)))
                  .toList(),
              onChanged: (v) => setState(() => _profileName = v!),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _sending ? null : _triggerScan,
                icon: _sending
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.bolt),
                label: Text(_sending ? 'Enviando...' : 'Escanear red'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _cyan,
                  foregroundColor: _bg,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
            if (_lastMessage != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _surface,
                  border: Border.all(color: _lastOk ? _green : _red),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  _lastMessage!,
                  style: TextStyle(color: _lastOk ? _green : _red),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(color: _muted, fontSize: 12)),
      );
}

class _Banner extends StatelessWidget {
  const _Banner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _surface,
        border: Border.all(color: _border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Text(
        'Versión preliminar: esta app solo dispara el escaneo. '
        'El resultado sigue llegando por Telegram y por email — todavía '
        'no hay notificación push en la app. Ver README.md para el roadmap.',
        style: TextStyle(color: _muted, fontSize: 12),
      ),
    );
  }
}
