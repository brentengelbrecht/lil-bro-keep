"""Runs every test against a throwaway local web server. Usage (from the project folder): python3 tests/run_all.py   or   python3 tests/run_all.py word ...   to run only the suites whose title or file name contains one of the words."""
import subprocess,sys,time,os,re
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv=subprocess.Popen([sys.executable,'-m','http.server','8765'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
suites=[('order logic (node)',['node','tests/t36_order_logic.js']),('encrypt.js unit (node)',['node','tests/t41_encrypt_unit.js']),
 ('image layout geometry','t1_layout'),('card colour picker','t3_colour'),('viewer zoom','t6_viewer'),
 ('virtual grid (400 notes)','t7_vgrid'),('image flush + pin + colour fill','t9_cards'),('note ordering and drag','t10_order'),
 ('progress ring','t14_ring'),('folder mode','t20_folder'),('folder dialogs','t21_folder_ui'),('escaping and scale','t22_escaping_scale'),('image drag (mouse)','t23_gallery_drag'),('drag on touch','t24_touch_drag'),('drag auto-scroll','t25_drag_autoscroll'),('note opens at top','t26_open_at_top'),('note editor','t27_editor'),('import and export','t30_import_export'),('folder start-up','t31_folder_boot'),('labels, replace dialog, camera','t32_labels_capture'),('robustness','t33_robustness'),('keyboard in the grid','t34_keyboard_grid'),('dialogs','t35_dialogs'),('two copies on one folder','t37_multi_tab'),('error and edge paths','t38_edge_paths'),('lazy loading and index','t39_lazy'),('encryption','t40_encrypt'),('locked app','t42_locked'),('editor drafts','t43_drafts'),('encryption dialogs','t44_dialogs'),('import, drafts and large files with encryption','t45_stage5'),('lock button and recovery','t46_recovery'),('folder: encryption first','t47_folder_encryption_first'),('deferred label actions','t48_deferred_labels')]
names={'t1_layout':'t1','t3_colour':'t3','t6_viewer':'t6','t7_vgrid':'t7','t9_cards':'t9','t10_order':'t10','t14_ring':'t14','t20_folder':'t20_folder','t21_folder_ui':'t21_folder_ui','t22_escaping_scale':'t22_escaping_scale','t23_gallery_drag':'t23_gallery_drag','t24_touch_drag':'t24_touch_drag','t25_drag_autoscroll':'t25_drag_autoscroll','t26_open_at_top':'t26_open_at_top','t27_editor':'t27_editor','t30_import_export':'t30_import_export','t31_folder_boot':'t31_folder_boot','t32_labels_capture':'t32_labels_capture','t33_robustness':'t33_robustness','t34_keyboard_grid':'t34_keyboard_grid','t35_dialogs':'t35_dialogs','t37_multi_tab':'t37_multi_tab','t38_edge_paths':'t38_edge_paths','t39_lazy':'t39_lazy','t40_encrypt':'t40_encrypt','t42_locked':'t42_locked','t43_drafts':'t43_drafts','t44_dialogs':'t44_dialogs','t45_stage5':'t45_stage5','t46_recovery':'t46_recovery','t47_folder_encryption_first':'t47_folder_encryption_first','t48_deferred_labels':'t48_deferred_labels'}
bad=0
try:
    pick=sys.argv[1:]      # optional: only suites whose title or file name contains one of these words
    for title,cmd in suites:
        if pick and not any(w.lower() in (title+' '+(cmd if isinstance(cmd,str) else ' '.join(cmd))).lower() for w in pick):continue
        if isinstance(cmd,str):cmd=[sys.executable,f'tests/{names[cmd]}.py']
        r=subprocess.run(cmd,cwd=root,capture_output=True,text=True,timeout=400)
        out=r.stdout
        fails=[l for l in out.splitlines() if l.startswith('FAIL ')]
        errs=[l for l in out.splitlines() if l.startswith('errors') and l.strip() not in ('errors []',)]
        passed=sum(1 for l in out.splitlines() if l.startswith(('PASS','ok ')))
        status='ok ' if r.returncode==0 and not fails and not errs else 'BAD'
        if status=='BAD':bad+=1
        print(f'[{status}] {title}: {passed} checks passed'+(f', {len(fails)} failed' if fails else ''))
        for l in fails+errs:print('        ',l)
        if r.returncode!=0 and not fails and not errs:print('         exit code',r.returncode,(r.stderr or out)[-300:])
finally:
    srv.terminate()
print('ALL GOOD' if not bad else f'{bad} suite(s) need attention');sys.exit(1 if bad else 0)
